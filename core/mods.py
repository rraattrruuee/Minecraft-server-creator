"""
Gestionnaire de Mods pour serveurs Forge/Fabric
Utilise l'API Modrinth (gratuite, ouverte) pour rechercher et télécharger des mods
"""
import os
import re
import json
import requests
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)


class ModManager:
    """
    Gestionnaire de mods pour serveurs Minecraft Forge/Fabric
    Utilise l'API Modrinth v2 (gratuite, pas de clé requise)
    """
    
    MODRINTH_API = "https://api.modrinth.com/v2"
    USER_AGENT = "MCPanel/1.0 (github.com/rraattrruuee/Minecraft-server-creator)"
    
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.headers = {
            "User-Agent": self.USER_AGENT,
            "Accept": "application/json"
        }
    
    def _validate_server_name(self, name: str) -> str:
        """Valide le nom du serveur"""
        if not name or not re.match(r'^[a-zA-Z0-9_-]+$', name):
            raise Exception("Nom de serveur invalide")
        return name
    
    def _get_mods_path(self, srv_name: str) -> str:
        """Retourne le chemin sécurisé du dossier mods (Compatible Docker/Legacy)"""
        srv_name = self._validate_server_name(srv_name)
        server_root = os.path.join(self.base_dir, srv_name)
        
        # Détection structure Docker vs Legacy
        # Docker: servers/<name>/data/mods
        # Legacy: servers/<name>/mods
        docker_mods_path = os.path.join(server_root, "data", "mods")
        legacy_mods_path = os.path.join(server_root, "mods")

        if os.path.exists(os.path.join(server_root, "docker-compose.yml")):
            path = docker_mods_path
            if not os.path.exists(path):
                os.makedirs(path, exist_ok=True)
        elif os.path.exists(docker_mods_path):
             path = docker_mods_path
        else:
            path = legacy_mods_path

        # Sécurité Path Traversal
        if not os.path.abspath(path).startswith(os.path.abspath(self.base_dir)):
            raise Exception("Chemin invalide")
            
        return path
    
    def search(self, query: str, loader: str = None, mc_version: str = None, 
               limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """
        Recherche des mods sur Modrinth
        
        Args:
            query: Terme de recherche
            loader: Type de loader (forge, fabric, quilt, neoforge)
            mc_version: Version Minecraft (ex: 1.20.1)
            limit: Nombre de résultats (max 100)
            offset: Offset pour pagination
        
        Returns:
            Dict avec les résultats de recherche
        """
        params = {
            "query": query,
            "limit": min(limit, 100),
            "offset": offset,
            "facets": []
        }
        
        # Construire les facets pour filtrer
        facets = []
        if loader:
            facets.append([f'categories:{loader}'])
        if mc_version:
            facets.append([f'versions:{mc_version}'])
        # Seulement les mods (pas les modpacks, shaders, etc.)
        facets.append(['project_type:mod'])
        
        if facets:
            params["facets"] = json.dumps(facets)
        
        try:
            r = requests.get(
                f"{self.MODRINTH_API}/search",
                params=params,
                headers=self.headers,
                timeout=15
            )
            r.raise_for_status()
            data = r.json()
            
            # Formater les résultats
            results = []
            for hit in data.get("hits", []):
                results.append({
                    "id": hit.get("project_id"),
                    "slug": hit.get("slug"),
                    "name": hit.get("title"),
                    "description": hit.get("description"),
                    "author": hit.get("author"),
                    "downloads": hit.get("downloads", 0),
                    "icon_url": hit.get("icon_url"),
                    "categories": hit.get("categories", []),
                    "versions": hit.get("versions", []),
                    "loaders": hit.get("loaders", []),
                    "latest_version": hit.get("latest_version"),
                    "updated": hit.get("date_modified"),
                    "source": "modrinth"
                })
            
            return {
                "results": results,
                "total": data.get("total_hits", len(results)),
                "limit": data.get("limit", limit),
                "offset": data.get("offset", offset)
            }
            
        except requests.Timeout:
            return {"results": [], "error": "Timeout", "total": 0}
        except Exception as e:
            logger.error(f"[ERROR] Erreur recherche mods: {e}")
            return {"results": [], "error": str(e), "total": 0}
    
    def get_mod_details(self, project_id: str) -> Dict[str, Any]:
        """Récupère les détails d'un mod"""
        try:
            r = requests.get(
                f"{self.MODRINTH_API}/project/{project_id}",
                headers=self.headers,
                timeout=10
            )
            r.raise_for_status()
            data = r.json()
            
            return {
                "id": data.get("id"),
                "slug": data.get("slug"),
                "name": data.get("title"),
                "description": data.get("description"),
                "body": data.get("body"),  # Description longue en markdown
                "author": data.get("team"),
                "downloads": data.get("downloads", 0),
                "followers": data.get("followers", 0),
                "icon_url": data.get("icon_url"),
                "categories": data.get("categories", []),
                "loaders": data.get("loaders", []),
                "game_versions": data.get("game_versions", []),
                "license": data.get("license", {}).get("id"),
                "source_url": data.get("source_url"),
                "issues_url": data.get("issues_url"),
                "wiki_url": data.get("wiki_url"),
                "discord_url": data.get("discord_url"),
                "updated": data.get("updated"),
                "published": data.get("published"),
                "source": "modrinth"
            }
        except Exception as e:
            return {"error": str(e)}
    
    def get_mod_versions(self, project_id: str, loader: str = None, 
                         mc_version: str = None) -> List[Dict[str, Any]]:
        """
        Récupère les versions disponibles d'un mod
        
        Args:
            project_id: ID ou slug du projet
            loader: Filtrer par loader (forge, fabric, etc.)
            mc_version: Filtrer par version MC
        """
        params = {}
        if loader:
            params["loaders"] = json.dumps([loader])
        if mc_version:
            params["game_versions"] = json.dumps([mc_version])
        
        try:
            r = requests.get(
                f"{self.MODRINTH_API}/project/{project_id}/version",
                params=params,
                headers=self.headers,
                timeout=10
            )
            r.raise_for_status()
            versions = r.json()
            
            results = []
            for v in versions:
                # Trouver le fichier principal
                primary_file = None
                for f in v.get("files", []):
                    if f.get("primary"):
                        primary_file = f
                        break
                if not primary_file and v.get("files"):
                    primary_file = v["files"][0]
                
                results.append({
                    "id": v.get("id"),
                    "version_number": v.get("version_number"),
                    "name": v.get("name"),
                    "changelog": v.get("changelog"),
                    "game_versions": v.get("game_versions", []),
                    "loaders": v.get("loaders", []),
                    "version_type": v.get("version_type"),  # release, beta, alpha
                    "downloads": v.get("downloads", 0),
                    "published": v.get("date_published"),
                    "file": {
                        "filename": primary_file.get("filename") if primary_file else None,
                        "url": primary_file.get("url") if primary_file else None,
                        "size": primary_file.get("size") if primary_file else None,
                        "sha512": primary_file.get("hashes", {}).get("sha512") if primary_file else None
                    } if primary_file else None,
                    "dependencies": v.get("dependencies", [])
                })
            
            return results
            
        except Exception as e:
            logger.error(f"[ERROR] Erreur récupération versions mod: {e}")
            return []
    
    def _metadata_path(self, srv_name: str) -> str:
        """Retourne le chemin du fichier de métadonnées des mods"""
        server_root = os.path.join(self.base_dir, srv_name)
        return os.path.join(server_root, "mods_meta.json")

    def _load_metadata(self, srv_name: str) -> Dict[str, Any]:
        """Charge la méta existante (ou retourne un dict vide)"""
        path = self._metadata_path(srv_name)
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"[WARN] Impossible de lire metadata mods pour {srv_name}: {e}")
        return {}

    def _save_metadata(self, srv_name: str, meta: Dict[str, Any]):
        """Écrit le dictionnaire de méta dans le fichier correspondant"""
        path = self._metadata_path(srv_name)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)
        except Exception as e:
            logger.error(f"[ERROR] Impossible de sauvegarder metadata mods pour {srv_name}: {e}")

    def list_installed(self, srv_name: str) -> List[Dict[str, Any]]:
        """Liste les mods installés sur un serveur

        Les informations retournées incluent désormais les éventuels
        **icon_url** et **url** pour permettre l'affichage du logo et
        d'un lien vers la page du mod.
        """
        mods_path = self._get_mods_path(srv_name)
        
        if not os.path.exists(mods_path):
            return []
        
        mods = []
        try:
            for f in os.listdir(mods_path):
                if f.endswith(".jar"):
                    full_path = os.path.join(mods_path, f)
                    stat = os.stat(full_path)
                    mods.append({
                        "name": f,
                        "filename": f,
                        "size_mb": round(stat.st_size / 1024 / 1024, 2),
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "path": full_path
                    })
        except Exception as e:
            logger.warning(f"[WARN] Erreur listage mods: {e}")
        
        # Merge metadata if available
        meta = self._load_metadata(srv_name)
        for m in mods:
            info = meta.get(m["filename"], {})
            # copy any known fields (slug, project_id, icon_url, url)
            if info:
                m.update({
                    "project_id": info.get("project_id"),
                    "slug": info.get("slug"),
                    "icon_url": info.get("icon_url"),
                    "url": info.get("url")
                })
        
        return sorted(mods, key=lambda x: x["name"].lower())
    
    def install(self, srv_name: str, project_id: str, version_id: str = None,
                loader: str = None, mc_version: str = None) -> Dict[str, Any]:
        """
        Installe un mod depuis Modrinth
        
        Args:
            srv_name: Nom du serveur
            project_id: ID ou slug du projet
            version_id: ID de version spécifique (optionnel)
            loader: Type de loader pour filtrer
            mc_version: Version MC pour filtrer
        """
        mods_path = self._get_mods_path(srv_name)
        os.makedirs(mods_path, exist_ok=True)
        
        try:
            # Si pas de version spécifiée, prendre la dernière compatible
            if not version_id:
                versions = self.get_mod_versions(project_id, loader, mc_version)
                if not versions:
                    return {"success": False, "message": "Aucune version compatible trouvée"}
                
                # Prendre la première version release, sinon la première dispo
                for v in versions:
                    if v.get("version_type") == "release":
                        version_id = v["id"]
                        break
                if not version_id:
                    version_id = versions[0]["id"]
            
            # Récupérer les infos de la version
            r = requests.get(
                f"{self.MODRINTH_API}/version/{version_id}",
                headers=self.headers,
                timeout=10
            )
            r.raise_for_status()
            version_data = r.json()
            
            # Trouver le fichier principal
            primary_file = None
            for f in version_data.get("files", []):
                if f.get("primary"):
                    primary_file = f
                    break
            if not primary_file and version_data.get("files"):
                primary_file = version_data["files"][0]
            
            if not primary_file:
                return {"success": False, "message": "Aucun fichier trouvé"}
            
            # Télécharger
            download_url = primary_file.get("url")
            filename = primary_file.get("filename")
            
            # Sécuriser le nom de fichier
            safe_filename = re.sub(r'[^\w\-.]', '_', filename)
            dest_path = os.path.join(mods_path, safe_filename)
            
            # Vérifier si déjà installé
            if os.path.exists(dest_path):
                return {"success": False, "message": "Ce mod est déjà installé"}
            
            logger.info(f"[INFO] Téléchargement mod: {safe_filename}")
            
            with requests.get(download_url, stream=True, headers=self.headers, timeout=120) as r:
                r.raise_for_status()
                total = int(r.headers.get('content-length', 0))
                downloaded = 0
                
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
            
            logger.info(f"[INFO] Mod installé: {safe_filename}")

            # --- save metadata for logo/documentation support ---
            try:
                details = self.get_mod_details(project_id)
                slug = details.get("slug")
                icon = details.get("icon_url")
                project_url = f"https://modrinth.com/mod/{slug}" if slug else None
                meta = self._load_metadata(srv_name)
                meta[safe_filename] = {
                    "project_id": project_id,
                    "slug": slug,
                    "icon_url": icon,
                    "url": project_url
                }
                self._save_metadata(srv_name, meta)
            except Exception:
                # ne pas bloquer l'installation si la méta échoue
                logger.warning(f"[WARN] impossible de sauvegarder metadata pour {safe_filename}")

            return {
                "success": True,
                "filename": safe_filename,
                "version": version_data.get("version_number"),
                "message": f"Mod {filename} installé avec succès"
            }
            
        except requests.Timeout:
            return {"success": False, "message": "Timeout lors du téléchargement"}
        except requests.HTTPError as e:
            return {"success": False, "message": f"Erreur HTTP: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"[ERROR] Erreur installation mod: {e}")
            return {"success": False, "message": str(e)}
    
    def uninstall(self, srv_name: str, mod_filename: str) -> Dict[str, Any]:
        """Désinstalle un mod"""
        mods_path = self._get_mods_path(srv_name)
        mod_path = os.path.join(mods_path, mod_filename)
        
        # Validation sécurité
        if not os.path.abspath(mod_path).startswith(os.path.abspath(mods_path)):
            return {"success": False, "message": "Chemin invalide"}
        
        if not os.path.exists(mod_path):
            return {"success": False, "message": "Mod non trouvé"}
        
        try:
            os.remove(mod_path)
            logger.info(f"[INFO] Mod supprimé: {mod_filename}")
            return {"success": True, "message": f"Mod {mod_filename} supprimé"}
        except Exception as e:
            logger.error(f"[ERROR] Erreur suppression mod: {e}")
            return {"success": False, "message": str(e)}
    
    def get_popular_mods(self, loader: str = None, mc_version: str = None, 
                         limit: int = 20) -> Dict[str, Any]:
        """Récupère les mods les plus populaires"""
        params = {
            "limit": min(limit, 100),
            "index": "downloads"  # Trier par téléchargements
        }
        
        facets = []
        if loader:
            facets.append([f'categories:{loader}'])
        if mc_version:
            facets.append([f'versions:{mc_version}'])
        facets.append(['project_type:mod'])
        
        if facets:
            params["facets"] = json.dumps(facets)
        
        try:
            r = requests.get(
                f"{self.MODRINTH_API}/search",
                params=params,
                headers=self.headers,
                timeout=15
            )
            r.raise_for_status()
            data = r.json()
            
            results = []
            for hit in data.get("hits", []):
                results.append({
                    "id": hit.get("project_id"),
                    "slug": hit.get("slug"),
                    "name": hit.get("title"),
                    "description": hit.get("description"),
                    "author": hit.get("author"),
                    "downloads": hit.get("downloads", 0),
                    "icon_url": hit.get("icon_url"),
                    "categories": hit.get("categories", []),
                    "source": "modrinth"
                })
            
            return {"results": results, "total": data.get("total_hits", 0)}
            
        except Exception as e:
            return {"results": [], "error": str(e), "total": 0}
    
    def get_categories(self) -> List[Dict[str, Any]]:
        """Récupère les catégories de mods disponibles"""
        try:
            r = requests.get(
                f"{self.MODRINTH_API}/tag/category",
                headers=self.headers,
                timeout=10
            )
            r.raise_for_status()
            categories = r.json()
            
            # Filtrer pour ne garder que les catégories de mods
            mod_categories = [
                c for c in categories 
                if c.get("project_type") == "mod"
            ]
            
            return mod_categories
        except Exception as e:
            logger.warning(f"[WARN] Erreur récupération catégories: {e}")
            return []
    
    def get_loaders(self) -> List[Dict[str, Any]]:
        """Récupère la liste des loaders disponibles"""
        try:
            r = requests.get(
                f"{self.MODRINTH_API}/tag/loader",
                headers=self.headers,
                timeout=10
            )
            r.raise_for_status()
            loaders = r.json()
            
            # Filtrer pour les loaders de mods Minecraft
            minecraft_loaders = [
                l for l in loaders 
                if l.get("supported_project_types") and "mod" in l.get("supported_project_types", [])
            ]
            
            return minecraft_loaders
        except Exception as e:
            logger.warning(f"[WARN] Erreur récupération loaders: {e}")
            # Fallback
            return [
                {"name": "forge", "icon": None},
                {"name": "fabric", "icon": None},
                {"name": "neoforge", "icon": None},
                {"name": "quilt", "icon": None}
            ]
