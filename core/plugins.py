import os
import re
import logging
import requests

logger = logging.getLogger(__name__)


class PluginManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def _validate_server_name(self, name):
        """Valide le nom du serveur"""
        if not name or not re.match(r'^[a-zA-Z0-9_-]+$', name):
            raise Exception("Nom de serveur invalide")
        return name

    def _get_plugins_path(self, srv_name):
        """Retourne le chemin sécurisé du dossier plugins (Compatible Docker/Legacy)"""
        srv_name = self._validate_server_name(srv_name)
        server_root = os.path.join(self.base_dir, srv_name)
        
        # Détection structure Docker vs Legacy
        docker_plugins_path = os.path.join(server_root, "data", "plugins")
        legacy_plugins_path = os.path.join(server_root, "plugins")

        if os.path.exists(os.path.join(server_root, "docker-compose.yml")):
            path = docker_plugins_path
            if not os.path.exists(path):
                os.makedirs(path, exist_ok=True)
        elif os.path.exists(docker_plugins_path):
             path = docker_plugins_path
        else:
            path = legacy_plugins_path

        if not os.path.abspath(path).startswith(os.path.abspath(self.base_dir)):
            raise Exception("Chemin invalide")
        return path

    def search(self, query, limit=20):
        """Recherche des plugins sur Hangar"""
        params = {"limit": limit}
        if query and len(query.strip()) > 0:
            params["q"] = query.strip()
        
        try:
            r = requests.get(
                "https://hangar.papermc.io/api/v1/projects",
                params=params,
                headers=self.headers,
                timeout=15
            )
            if r.status_code == 200:
                data = r.json()
                # Filtrer pour ne garder que les plugins Paper
                results = data.get("result", [])
                paper_results = [
                    p for p in results 
                    if "PAPER" in p.get("settings", {}).get("tags", []) or 
                       "PAPER" in str(p.get("settings", {}).get("platforms", []))
                ]
                # Si pas de filtrage possible, retourner tout
                if not paper_results and results:
                    return {"result": results}
                return {"result": paper_results if paper_results else results}
            logger.warning(f"[WARN] Hangar API retourné status {r.status_code}")
            return {"result": []}
        except requests.Timeout:
            logger.warning("[WARN] Timeout lors de la recherche Hangar")
            return {"result": [], "error": "Timeout"}
        except Exception as e:
            logger.error(f"[ERROR] Erreur recherche plugins: {e}")
            return {"result": [], "error": str(e)}

    def list_installed(self, srv_name):
        """Liste les plugins installés sur un serveur"""
        plugins_path = self._get_plugins_path(srv_name)
        
        if not os.path.exists(plugins_path):
            return []
        
        plugins = []
        try:
            for f in os.listdir(plugins_path):
                if f.endswith(".jar"):
                    full_path = os.path.join(plugins_path, f)
                    stat = os.stat(full_path)
                    plugins.append({
                        "name": f,
                        "size_mb": round(stat.st_size / 1024 / 1024, 2),
                        "path": full_path
                    })
        except Exception as e:
            logger.warning(f"[WARN] Erreur listage plugins: {e}")
        
        return sorted(plugins, key=lambda x: x["name"].lower())

    def install(self, srv_name, author, slug):
        """Installe un plugin depuis Hangar"""
        plugins_path = self._get_plugins_path(srv_name)
        
        # Créer le dossier plugins s'il n'existe pas
        os.makedirs(plugins_path, exist_ok=True)
        
        try:
            url = f"https://hangar.papermc.io/api/v1/projects/{author}/{slug}/versions"
            r = requests.get(url, params={"limit": 5}, headers=self.headers, timeout=15)
            r.raise_for_status()
            data = r.json()

            if not data.get("result"):
                return {"success": False, "message": "Aucune version trouvée."}

            dl_url = None
            version_name = ""

            # Chercher une version compatible PAPER
            for v in data["result"]:
                downloads = v.get("downloads", {})
                if "PAPER" in downloads:
                    dl_info = downloads["PAPER"]
                    dl_url = dl_info.get("downloadUrl") or dl_info.get("externalUrl")
                    version_name = v["name"]
                    break

            # Fallback sur la première plateforme disponible
            if not dl_url and data["result"]:
                first_v = data["result"][0]
                first_platform = list(first_v["downloads"].keys())[0]
                dl_info = first_v["downloads"][first_platform]
                dl_url = dl_info.get("downloadUrl") or dl_info.get("externalUrl")
                version_name = first_v["name"]

            if not dl_url:
                return {"success": False, "message": "Lien de téléchargement introuvable."}

            # Nettoyer le nom de fichier
            safe_slug = re.sub(r'[^\w\-.]', '_', slug)
            safe_version = re.sub(r'[^\w\-.]', '_', version_name)
            fname = f"{safe_slug}-{safe_version}.jar"
            
            logger.info(f"[INFO] Téléchargement: {fname}")
            dest = os.path.join(plugins_path, fname)

            # Vérifier si déjà installé
            if os.path.exists(dest):
                return {"success": False, "message": "Ce plugin est déjà installé."}

            # Télécharger le plugin
            with requests.get(dl_url, stream=True, headers=self.headers, timeout=60) as r:
                r.raise_for_status()
                total = int(r.headers.get('content-length', 0))
                downloaded = 0
                
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            pct = int(downloaded * 100 / total)
                            logger.info(f"[INFO] Téléchargement: {pct}%", end="\r")

            logger.info(f"[INFO] Plugin installé: {fname}")
            return {"success": True, "filename": fname}
            
        except requests.Timeout:
            return {"success": False, "message": "Timeout lors du téléchargement"}
        except requests.HTTPError as e:
            return {"success": False, "message": f"Erreur HTTP: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"[ERROR] Erreur installation plugin: {e}")
            return {"success": False, "message": str(e)}

    def uninstall(self, srv_name, plugin_name):
        """Désinstalle un plugin"""
        plugins_path = self._get_plugins_path(srv_name)
        plugin_path = os.path.join(plugins_path, plugin_name)
        
        # Validation sécurité
        if not os.path.abspath(plugin_path).startswith(os.path.abspath(plugins_path)):
            return {"success": False, "message": "Chemin invalide"}
        
        if not os.path.exists(plugin_path):
            return {"success": False, "message": "Plugin non trouvé"}
        
        try:
            os.remove(plugin_path)
            logger.info(f"[INFO] Plugin supprimé: {plugin_name}")
            return {"success": True}
        except Exception as e:
            logger.error(f"[ERROR] Erreur suppression plugin: {e}")
            return {"success": False, "message": str(e)}
