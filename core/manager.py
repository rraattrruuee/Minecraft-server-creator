import json
import os
import platform
import re
import shutil
import subprocess
import time
import zipfile
import tarfile
import yaml
from typing import List, Dict, Any
from datetime import datetime
from werkzeug.utils import secure_filename

# Templates de serveurs pré-configurés
SERVER_TEMPLATES = {
    'vanilla_survival': {
        'name': 'Survival Vanilla',
        'description': 'Serveur survival classique optimisé avec Paper',
        'icon': 'fa-mountain',
        'config': {
            'server_type': 'paper',
            'difficulty': 'normal',
            'gamemode': 'survival',
            'pvp': 'true',
            'spawn-protection': '16'
        }
    },
    'creative': {
        'name': 'Creative Building',
        'description': 'Mode créatif avec monde plat pour constructions',
        'icon': 'fa-palette',
        'config': {
            'server_type': 'paper',
            'gamemode': 'creative',
            'difficulty': 'peaceful',
            'pvp': 'false',
            'spawn-protection': '0',
            'level-type': 'flat',
            'spawn-monsters': 'false'
        }
    },
    'pvp_arena': {
        'name': 'PvP Arena',
        'description': 'Arène PvP compétitive avec respawn rapide',
        'icon': 'fa-crosshairs',
        'config': {
            'server_type': 'paper',
            'pvp': 'true',
            'difficulty': 'hard',
            'spawn-protection': '0',
            'max-world-size': '1000',
            'hardcore': 'false'
        }
    },
    'modded': {
        'name': 'Modded (Forge)',
        'description': 'Serveur moddé avec Forge',
        'icon': 'fa-cubes',
        'config': {
            'server_type': 'forge',
            'ram_max': '4096M',
            'ram_min': '2048M'
        }
    }
}

from datetime import datetime

import psutil
import requests
from core.webhooks import WebhookManager

class ServerManager:
    def __init__(self, base_dir="servers"):
        self.base_dir = os.path.abspath(base_dir)
        self.servers_dir = self.base_dir  # Alias pour compatibilité
        self.procs = {}
        self.log_files = {} 
        self.java_dir = os.path.join(self.base_dir, "_java")
        self.webhook_mgr = WebhookManager()

    def _get_required_java_version(self, mc_version):
        """Détermine la version Java requise selon la version Minecraft"""
        # Format version: "1.X.Y" ou "1.X"
        try:
            parts = mc_version.split(".")
            major = int(parts[1]) if len(parts) > 1 else 0
            
            # Minecraft 1.21+ requiert Java 21
            if major >= 21:
                return 21
            # Minecraft 1.18-1.20 requiert Java 17
            elif major >= 18:
                return 17
            # Minecraft 1.17 requiert Java 16
            elif major == 17:
                return 16
            # Minecraft 1.12-1.16 fonctionne avec Java 8-11
            else:
                return 8
        except:
            return 17  # Par défaut Java 17

    def _get_java_path(self, java_version):
        """Retourne le chemin vers le binaire Java pour une version donnée"""
        java_home = os.path.join(self.java_dir, f"java-{java_version}")
        
        if platform.system() == "Windows":
            java_bin = os.path.join(java_home, "bin", "java.exe")
        else:
            java_bin = os.path.join(java_home, "bin", "java")
        
        if os.path.exists(java_bin):
            return java_bin
        return None

    def _download_java(self, java_version):
        """Télécharge le JRE Adoptium/Temurin pour la version spécifiée"""
        os.makedirs(self.java_dir, exist_ok=True)
        java_home = os.path.join(self.java_dir, f"java-{java_version}")
        
        # Si déjà téléchargé, retourner le chemin
        java_bin = self._get_java_path(java_version)
        if java_bin:
            print(f"[INFO] Java {java_version} déjà présent")
            return java_bin
        
        print(f"[INFO] Téléchargement de Java {java_version}...")
        
        # Déterminer l'OS et l'architecture
        system = platform.system().lower()
        machine = platform.machine().lower()
        
        if system == "windows":
            os_name = "windows"
            ext = "zip"
        elif system == "darwin":
            os_name = "mac"
            ext = "tar.gz"
        else:
            os_name = "linux"
            ext = "tar.gz"
        
        if machine in ("x86_64", "amd64"):
            arch = "x64"
        elif machine in ("aarch64", "arm64"):
            arch = "aarch64"
        else:
            arch = "x64"
        
        try:
            # API Adoptium pour télécharger le JRE
            api_url = f"https://api.adoptium.net/v3/assets/latest/{java_version}/hotspot"
            params = {
                "architecture": arch,
                "image_type": "jre",
                "os": os_name,
                "vendor": "eclipse"
            }
            
            response = requests.get(api_url, params=params, timeout=30)
            response.raise_for_status()
            assets = response.json()
            
            if not assets:
                raise Exception(f"Aucun JRE trouvé pour Java {java_version}")
            
            # Trouver le bon asset
            download_url = None
            for asset in assets:
                binary = asset.get("binary", {})
                package = binary.get("package", {})
                if package.get("link"):
                    download_url = package["link"]
                    break
            
            if not download_url:
                raise Exception("URL de téléchargement non trouvée")
            
            # Télécharger l'archive
            print(f"[INFO] Téléchargement depuis: {download_url[:80]}...")
            archive_path = os.path.join(self.java_dir, f"java-{java_version}.{ext}")
            
            with requests.get(download_url, stream=True, timeout=300) as r:
                r.raise_for_status()
                total = int(r.headers.get('content-length', 0))
                downloaded = 0
                with open(archive_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            pct = int(downloaded * 100 / total)
                            print(f"[INFO] Téléchargement Java: {pct}%", end="\r")
            
            print(f"\n[INFO] Extraction de Java {java_version}...")
            
            # Extraire l'archive
            temp_extract = os.path.join(self.java_dir, f"temp_java_{java_version}")
            os.makedirs(temp_extract, exist_ok=True)
            
            if ext == "zip":
                with zipfile.ZipFile(archive_path, 'r') as z:
                    z.extractall(temp_extract)
            else:
                with tarfile.open(archive_path, 'r:gz') as t:
                    t.extractall(temp_extract)
            
            # Trouver le dossier extrait et le renommer
            extracted_dirs = os.listdir(temp_extract)
            if extracted_dirs:
                extracted_path = os.path.join(temp_extract, extracted_dirs[0])
                shutil.move(extracted_path, java_home)
            
            # Nettoyage
            shutil.rmtree(temp_extract, ignore_errors=True)
            os.remove(archive_path)
            
            java_bin = self._get_java_path(java_version)
            if java_bin:
                print(f"[INFO] Java {java_version} installé avec succès!")
                return java_bin
            else:
                raise Exception("Installation Java échouée")
            
        except Exception as e:
            print(f"[ERROR] Erreur téléchargement Java: {e}")
            # Nettoyage en cas d'erreur
            shutil.rmtree(java_home, ignore_errors=True)
            raise Exception(f"Impossible de télécharger Java {java_version}: {e}")

    def ensure_java_for_version(self, mc_version):
        """S'assure que la bonne version de Java est disponible pour une version MC"""
        java_version = self._get_required_java_version(mc_version)
        java_path = self._get_java_path(java_version)
        
        if java_path:
            return java_path
        
        # Télécharger si nécessaire
        return self._download_java(java_version)

    def _validate_name(self, name):
        """Valide le nom du serveur pour éviter les injections de chemin"""
        if not name or not re.match(r'^[a-zA-Z0-9_\-]+$', name):
            raise Exception("Nom invalide. Utilisez uniquement lettres, chiffres, - et _ (PAS D'ESPACES)")
        if len(name) > 30:
            raise Exception("Nom trop long (max 30 caractères)")
        return name

    def get_server_templates(self) -> List[Dict[str, Any]]:
        """Retourne la liste des templates de serveurs disponibles"""
        return [
            {
                'id': template_id,
                **template_data
            }
            for template_id, template_data in SERVER_TEMPLATES.items()
        ]

    def _get_server_path(self, name):
        """Retourne le chemin sécurisé du serveur"""
        name = self._validate_name(name)
        path = os.path.join(self.base_dir, name)
        # Protection contre path traversal
        if not os.path.abspath(path).startswith(self.base_dir):
            raise Exception("Chemin invalide")
        return path

    def list_servers(self, owner=None):
        if not os.path.exists(self.base_dir):
            return []
        
        servers = []
        for d in os.listdir(self.base_dir):
            full_path = os.path.join(self.base_dir, d)
            if os.path.isdir(full_path):
                 # Check for server.jar OR owner file OR docker-compose.yml (Docker servers)
                 # Update: manager_config.json is the source of truth now
                 is_server = (
                     os.path.exists(os.path.join(full_path, "server.jar")) or 
                     os.path.exists(os.path.join(full_path, "manager_config.json")) or
                     os.path.exists(os.path.join(full_path, "docker-compose.yml"))
                 )

                 if is_server:
                    # Owner filter
                    if owner and owner != "admin":
                        # Check ownership in config
                        config_path = os.path.join(full_path, "manager_config.json")
                        try:
                            if os.path.exists(config_path):
                                with open(config_path, "r") as f:
                                    conf = json.load(f)
                                    if conf.get("owner") != owner:
                                        continue # Skip if not owner
                            else:
                                continue # Legacy servers owned by nobody/admin? Skip for regular users
                        except:
                            continue

                    servers.append(d)
        return servers

    def get_available_versions(self):
        """Récupère les versions Paper avec cache persistant (24h) + fallback"""
        from core.api_cache import cache
        
        # 1. Essayer cache persistant (24h)
        cached = cache.get('paper_versions', max_age_hours=24)
        if cached:
            return cached
        
        # 2. Essayer API Paper
        try:
            r = requests.get("https://api.papermc.io/v2/projects/paper", timeout=10)
            r.raise_for_status()
            versions = r.json()["versions"][::-1]
            cache.set('paper_versions', versions)
            return versions
        except Exception as e:
            print(f"[WARN] PaperMC API indisponible: {e}")
        
        # 3. Fallback hardcodé (versions populaires)
        fallback = ["1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.2", "1.20.1", "1.19.4", "1.19.3", "1.19.2", "1.18.2"]
        cache.set('paper_versions', fallback)
        print("[INFO] Utilisation des versions Paper par défaut")
        return fallback
    
    def get_paper_build_info(self, version: str) -> Dict[str, Any]:
        """Récupère les informations sur les builds Paper pour une version spécifique"""
        from core.api_cache import cache
        
        cache_key = f'paper_builds_{version}'
        cached = cache.get(cache_key, max_age_hours=6)  # Cache 6h pour les builds
        if cached:
            return cached
        
        try:
            r = requests.get(f"https://api.papermc.io/v2/projects/paper/versions/{version}", timeout=10)
            r.raise_for_status()
            data = r.json()
            
            builds = data.get("builds", [])
            latest_build = builds[-1] if builds else None
            
            # Récupérer les détails du dernier build
            build_info = {
                "version": version,
                "total_builds": len(builds),
                "latest_build": latest_build,
                "builds": builds[-10:] if len(builds) > 10 else builds,  # 10 derniers
            }
            
            if latest_build:
                try:
                    detail_r = requests.get(
                        f"https://api.papermc.io/v2/projects/paper/versions/{version}/builds/{latest_build}",
                        timeout=10
                    )
                    if detail_r.status_code == 200:
                        detail = detail_r.json()
                        build_info["latest_build_info"] = {
                            "build": latest_build,
                            "time": detail.get("time"),
                            "channel": detail.get("channel"),
                            "downloads": detail.get("downloads", {})
                        }
                except Exception:
                    pass
            
            cache.set(cache_key, build_info)
            return build_info
            
        except Exception as e:
            print(f"[WARN] Erreur récupération builds Paper {version}: {e}")
            return {"version": version, "error": str(e)}
    
    def get_paper_download_url(self, version: str, build: int = None) -> str:
        """Génère l'URL de téléchargement Paper"""
        if build is None:
            # Récupérer le dernier build
            build_info = self.get_paper_build_info(version)
            build = build_info.get("latest_build")
        
        if not build:
            raise Exception(f"Aucun build disponible pour Paper {version}")
        
        return f"https://api.papermc.io/v2/projects/paper/versions/{version}/builds/{build}/downloads/paper-{version}-{build}.jar"

    def get_forge_versions(self):
        """Récupère les versions Forge avec cache persistant (24h) + fallback"""
        from core.api_cache import cache
        
        # 1. Cache
        cached = cache.get('forge_versions', max_age_hours=24)
        if cached:
            return cached
        
        # 2. API
        try:
            r = requests.get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json", timeout=10)
            r.raise_for_status()
            data = r.json()
            versions = {}
            for key, val in data.get("promos", {}).items():
                if "-recommended" in key or "-latest" in key:
                    mc_ver = key.split("-")[0]
                    if mc_ver not in versions:
                        versions[mc_ver] = {}
                    if "-recommended" in key:
                        versions[mc_ver]["recommended"] = val
                    else:
                        versions[mc_ver]["latest"] = val
            cache.set('forge_versions', versions)
            return versions
        except Exception as e:
            print(f"[WARN] Forge API indisponible: {e}")
        
        # 3. Fallback vide avec message
        print("[INFO] Forge API inaccessible - création serveurs Forge indisponible")
        return {}
    
    def get_forge_builds(self, mc_version: str) -> Dict[str, Any]:
        """Récupère tous les builds Forge pour une version MC"""
        from core.api_cache import cache
        
        cache_key = f'forge_builds_{mc_version}'
        cached = cache.get(cache_key, max_age_hours=12)
        if cached:
            return cached
        
        try:
            # API Maven pour lister tous les builds
            url = f"https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json"
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            data = r.json()
            
            # Filtrer pour la version MC demandée
            builds = []
            for version_key in data.keys():
                if version_key.startswith(f"{mc_version}-"):
                    forge_ver = version_key.split("-", 1)[1]
                    builds.append({
                        "forge_version": forge_ver,
                        "full_version": version_key,
                        "mc_version": mc_version
                    })
            
            builds.sort(key=lambda x: x["forge_version"], reverse=True)
            
            result = {
                "mc_version": mc_version,
                "builds": builds[:20],  # 20 derniers
                "total": len(builds)
            }
            cache.set(cache_key, result)
            return result
            
        except Exception as e:
            print(f"[WARN] Erreur récupération builds Forge: {e}")
            return {"mc_version": mc_version, "builds": [], "error": str(e)}
    
    def get_neoforge_versions(self) -> Dict[str, Any]:
        """Récupère les versions NeoForge (fork moderne de Forge pour 1.20.1+)"""
        from core.api_cache import cache
        
        cached = cache.get('neoforge_versions', max_age_hours=12)
        if cached:
            return cached
        
        try:
            # API Maven NeoForge
            r = requests.get("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge", timeout=10)
            r.raise_for_status()
            data = r.json()
            
            versions = data.get("versions", [])
            
            # Grouper par version MC (filtrer les versions non numériques)
            grouped = {}
            valid_versions = []
            for v in versions:
                # Format: 20.4.xxx pour MC 1.20.4, 21.0.xxx pour MC 1.21, etc.
                # Ignorer les versions snapshot/expérimentales (ex: 25w14craftmine)
                parts = v.split(".")
                if len(parts) >= 2:
                    try:
                        major = int(parts[0])
                        minor = int(parts[1])
                        # Convertir en version MC
                        if major >= 20:
                            mc_ver = f"1.{major}.{minor}"
                        else:
                            mc_ver = f"1.{major}"
                        
                        if mc_ver not in grouped:
                            grouped[mc_ver] = []
                        grouped[mc_ver].append(v)
                        valid_versions.append(v)
                    except ValueError:
                        # Ignorer les versions non numériques (snapshots)
                        continue
            
            result = {
                "versions": grouped,
                "all_versions": valid_versions[-50:],  # 50 dernières
                "total": len(valid_versions)
            }
            cache.set('neoforge_versions', result)
            return result
            
        except Exception as e:
            print(f"[WARN] NeoForge API indisponible: {e}")
            return {"versions": {}, "all_versions": [], "error": str(e)}
    
    def get_fabric_versions(self):
        """Récupère les versions Fabric avec cache persistant (24h) + fallback"""
        from core.api_cache import cache
        
        # 1. Cache
        cached = cache.get('fabric_versions', max_age_hours=24)
        if cached:
            return cached
        
        # 2. API
        try:
            loader_r = requests.get("https://meta.fabricmc.net/v2/versions/loader", timeout=10)
            loader_r.raise_for_status()
            loaders = loader_r.json()
            
            game_r = requests.get("https://meta.fabricmc.net/v2/versions/game", timeout=10)
            game_r.raise_for_status()
            games = game_r.json()
            
            result = {
                "loader": [l["version"] for l in loaders if l.get("stable")],
                "loader_all": [l["version"] for l in loaders],
                "game": [g["version"] for g in games if g.get("stable")],
                "game_all": [g["version"] for g in games]
            }
            cache.set('fabric_versions', result)
            return result
        except Exception as e:
            print(f"[WARN] Fabric API indisponible: {e}")
        
        # 3. Fallback vide
        print("[INFO] Fabric API inaccessible - création serveurs Fabric indisponible")
        return {"loader": [], "loader_all": [], "game": [], "game_all": []}
    
    def get_fabric_loader_for_game(self, mc_version: str) -> List[str]:
        """Récupère les loaders Fabric compatibles avec une version MC (retourne les versions en strings)"""
        from core.api_cache import cache
        
        cache_key = f'fabric_loaders_{mc_version}'
        cached = cache.get(cache_key, max_age_hours=6)
        if cached:
            return cached
        
        try:
            r = requests.get(
                f"https://meta.fabricmc.net/v2/versions/loader/{mc_version}",
                timeout=10
            )
            r.raise_for_status()
            data = r.json()
            
            # Extraire uniquement les versions (strings) pour simplifier le frontend
            result = []
            for item in data:
                loader = item.get("loader", {})
                version = loader.get("version")
                if version:
                    result.append(version)
            
            cache.set(cache_key, result)
            return result
            
        except Exception as e:
            print(f"[WARN] Erreur récupération loaders Fabric: {e}")
            return []
    
    def get_quilt_versions(self) -> Dict[str, Any]:
        """Récupère les versions Quilt (fork de Fabric)"""
        from core.api_cache import cache
        
        cached = cache.get('quilt_versions', max_age_hours=24)
        if cached:
            return cached
        
        try:
            loader_r = requests.get("https://meta.quiltmc.org/v3/versions/loader", timeout=10)
            loader_r.raise_for_status()
            loaders = loader_r.json()
            
            game_r = requests.get("https://meta.quiltmc.org/v3/versions/game", timeout=10)
            game_r.raise_for_status()
            games = game_r.json()
            
            result = {
                "loader": [l["version"] for l in loaders],
                "game": [g["version"] for g in games if g.get("stable")]
            }
            cache.set('quilt_versions', result)
            return result
            
        except Exception as e:
            print(f"[WARN] Quilt API indisponible: {e}")
            return {"loader": [], "game": []}

    def download_forge_server(self, path, mc_version, forge_version):
        """Télécharge le serveur Forge"""
        # Format: https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{forge}/forge-{mc}-{forge}-installer.jar
        url = f"https://maven.minecraftforge.net/net/minecraftforge/forge/{mc_version}-{forge_version}/forge-{mc_version}-{forge_version}-installer.jar"
        
        installer_path = os.path.join(path, "forge-installer.jar")
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(installer_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
        
        # Run installer
        print("[INFO] Running Forge installer...")
        java_path = self.ensure_java_for_version(mc_version) or "java"
        result = subprocess.run(
            [java_path, "-jar", "forge-installer.jar", "--installServer"],
            cwd=path,
            capture_output=True,
            timeout=300
        )
        
        # Cleanup installer
        os.remove(installer_path)
        if os.path.exists(os.path.join(path, "forge-installer.jar.log")):
            os.remove(os.path.join(path, "forge-installer.jar.log"))
        
        # Find the run script or jar
        for f in os.listdir(path):
            if f.startswith("forge-") and f.endswith(".jar") and "installer" not in f:
                # Rename to server.jar for consistency
                shutil.move(os.path.join(path, f), os.path.join(path, "server.jar"))
                break
        
        return True
    
    def download_fabric_server(self, path, mc_version, loader_version):
        """Télécharge le serveur Fabric"""
        # Get installer version
        r = requests.get("https://meta.fabricmc.net/v2/versions/installer", timeout=10)
        r.raise_for_status()
        installer_version = r.json()[0]["version"]
        
        # Direct server jar download
        url = f"https://meta.fabricmc.net/v2/versions/loader/{mc_version}/{loader_version}/{installer_version}/server/jar"
        jar_path = os.path.join(path, "server.jar")
        
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(jar_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
        
        return True

    def download_neoforge_server(self, path, mc_version, neoforge_version):
        """Télécharge le serveur NeoForge"""
        # NeoForge utilise un format similaire à Forge
        # URL: https://maven.neoforged.net/releases/net/neoforged/neoforge/{version}/neoforge-{version}-installer.jar
        url = f"https://maven.neoforged.net/releases/net/neoforged/neoforge/{neoforge_version}/neoforge-{neoforge_version}-installer.jar"
        
        installer_path = os.path.join(path, "neoforge-installer.jar")
        try:
            with requests.get(url, stream=True, timeout=120) as r:
                r.raise_for_status()
                with open(installer_path, "wb") as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)
            
            # Run installer
            print("[INFO] Running NeoForge installer...")
            java_path = self.ensure_java_for_version(mc_version) or "java"
            result = subprocess.run(
                [java_path, "-jar", "neoforge-installer.jar", "--installServer"],
                cwd=path,
                capture_output=True,
                timeout=300
            )
            
            # Cleanup installer
            if os.path.exists(installer_path):
                os.remove(installer_path)
            if os.path.exists(os.path.join(path, "neoforge-installer.jar.log")):
                os.remove(os.path.join(path, "neoforge-installer.jar.log"))
            
            # Find the run script or jar
            for f in os.listdir(path):
                if f.startswith("neoforge-") and f.endswith(".jar") and "installer" not in f:
                    shutil.move(os.path.join(path, f), os.path.join(path, "server.jar"))
                    break
            
            return True
        except Exception as e:
            print(f"[ERROR] NeoForge download failed: {e}")
            raise Exception(f"NeoForge download failed: {e}")

    def download_quilt_server(self, path, mc_version, loader_version):
        """Télécharge le serveur Quilt"""
        # Get installer version
        r = requests.get("https://meta.quiltmc.org/v3/versions/installer", timeout=10)
        r.raise_for_status()
        installer_version = r.json()[0]["version"]
        
        # Download quilt server launcher jar
        url = f"https://meta.quiltmc.org/v3/versions/loader/{mc_version}/{loader_version}/installlerror-server/{installer_version}/server/jar"
        jar_path = os.path.join(path, "server.jar")
        
        try:
            with requests.get(url, stream=True, timeout=120) as r:
                r.raise_for_status()
                with open(jar_path, "wb") as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)
            return True
        except Exception as e:
            # Fallback: use quilt installer
            print(f"[WARN] Quilt direct download failed, using installer: {e}")
            installer_url = f"https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/{installer_version}/quilt-installer-{installer_version}.jar"
            installer_path = os.path.join(path, "quilt-installer.jar")
            
            with requests.get(installer_url, stream=True, timeout=120) as r:
                r.raise_for_status()
                with open(installer_path, "wb") as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)
            
            java_path = self.ensure_java_for_version(mc_version) or "java"
            subprocess.run(
                [java_path, "-jar", "quilt-installer.jar", "install", "server", mc_version, loader_version, "--download-server", "--install-dir=."],
                cwd=path,
                capture_output=True,
                timeout=300
            )
            
            if os.path.exists(installer_path):
                os.remove(installer_path)
            
            # Find quilt server jar
            for f in os.listdir(path):
                if f.startswith("quilt-server") and f.endswith(".jar"):
                    shutil.move(os.path.join(path, f), os.path.join(path, "server.jar"))
                    break
            
            return True

    def find_server_by_id(self, server_id):
        """Trouve un serveur par son ID unique"""
        servers = self.list_servers()
        for s in servers:
            try:
                cfg = self.get_server_config(s['name'])
                if str(cfg.get('id', '')) == str(server_id):
                    return s['name']
            except:
                continue
        return None

    def get_server_config(self, name):
        """Récupère la configuration personnalisée du serveur"""
        path = self._get_server_path(name)
        config_path = os.path.join(path, "manager_config.json")
        default_config = {
            "ram_min": "1G",
            "ram_max": "2G",
            "java_path": "java",
            "extra_args": [],
            "auto_restart": False
        }
        try:
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r", encoding="utf-8") as f:
                        raw = f.read()
                    print(f"[DEBUG] get_server_config: raw content of {config_path}: {raw}")
                    config = json.loads(raw)
                except Exception as e:
                    print(f"[WARN] Erreur lecture/parsing de {config_path}: {e}")
                    config = {}

                # Auto-detect server type if missing
                if "server_type" not in config:
                    config["server_type"] = self.detect_server_type(name)
                
                merged = {**default_config, **config}
                print(f"[DEBUG] get_server_config parsed {name}: {merged}")
                return merged
        except Exception as e:
            print(f"[WARN] Erreur lecture config {name}: {e}")
        return default_config

    def detect_server_type(self, name) -> str:
        """
        Détecte le type de serveur (paper, forge, fabric, neoforge, quilt) en analysant les fichiers.
        Retourne 'paper' par défaut si impossible à déterminer.
        """
        path = self._get_server_path(name)
        
        # 1. Vérifier l'existence du dossier mods vs plugins
        has_mods = os.path.exists(os.path.join(path, "mods"))
        has_plugins = os.path.exists(os.path.join(path, "plugins"))
        
        # 2. Chercher des fichiers spécifiques
        files = os.listdir(path) if os.path.exists(path) else []
        files_lower = [f.lower() for f in files]
        
        # Forge: présence de forge-*.jar, libraries/net/minecraftforge, ou fichiers run.bat/run.sh spécifiques
        if any("forge" in f and f.endswith(".jar") for f in files_lower):
            return "forge"
        if os.path.exists(os.path.join(path, "libraries", "net", "minecraftforge")):
            return "forge"
        
        # NeoForge: présence de neoforge-*.jar ou libraries/net/neoforged
        if any("neoforge" in f and f.endswith(".jar") for f in files_lower):
            return "neoforge"
        if os.path.exists(os.path.join(path, "libraries", "net", "neoforged")):
            return "neoforge"
        
        # Fabric: présence de fabric-server-*.jar, .fabric dans le dossier, ou fabric.mod.json dans les libs
        if any("fabric" in f and f.endswith(".jar") for f in files_lower):
            return "fabric"
        if os.path.exists(os.path.join(path, ".fabric")):
            return "fabric"
        
        # Quilt: présence de quilt-*.jar ou .quilt
        if any("quilt" in f and f.endswith(".jar") for f in files_lower):
            return "quilt"
        if os.path.exists(os.path.join(path, ".quilt")):
            return "quilt"
        
        # 3. Analyser le contenu des mods s'il y en a
        if has_mods and os.path.exists(os.path.join(path, "mods")):
            mods_list = os.listdir(os.path.join(path, "mods"))
            if len(mods_list) > 0:
                # Si mods présents mais pas de détection Forge/NeoForge, c'est probablement Fabric
                return "fabric"
        
        # 4. Paper / Spigot / Bukkit: présence de plugins ou paper-*.jar, spigot-*.jar
        if any("paper" in f and f.endswith(".jar") for f in files_lower):
            return "paper"
        if any("spigot" in f and f.endswith(".jar") for f in files_lower):
            return "paper"  # Spigot = compatible Paper
        if has_plugins and not has_mods:
            return "paper"
        
        # Default
        return "paper"

    def save_server_config(self, name, config):
        """Sauvegarde la configuration du serveur"""
        path = self._get_server_path(name)
        config_path = os.path.join(path, "manager_config.json")
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2)
            try:
                # Log a concise debug summary for tracing who/when overwrites config
                snippet = json.dumps(config, ensure_ascii=False)
                if len(snippet) > 200:
                    snippet = snippet[:200] + '...'
            except Exception:
                snippet = '<unserializable>'
            print(f"[DEBUG] save_server_config {name} @ {datetime.now().isoformat()} keys={list(config.keys())} has_server_type={('server_type' in config)} has_version={('version' in config)} snippet={snippet}")
            return True
        except Exception as e:
            print(f"[ERROR] Erreur sauvegarde config {name}: {e}")
            return False

    def set_server_meta(self, name, version=None, server_type=None, loader_version=None, forge_version=None):
        """Mets à jour la méta du serveur (version, type, loader/forge).

        Les champs fournis remplacent ceux présents dans la config. La fonction
        valide le server_type connu et sauvegarde la configuration.
        """
        valid_types = ['paper', 'forge', 'fabric', 'neoforge', 'quilt']
        cfg = self.get_server_config(name)

        if version:
            cfg['version'] = version
        if server_type:
            if server_type not in valid_types:
                raise Exception(f"Type de serveur inconnu: {server_type}")
            cfg['server_type'] = server_type
        if loader_version:
            cfg['loader_version'] = loader_version
        if forge_version:
            cfg['forge_version'] = forge_version

        return self.save_server_config(name, cfg)

    def _find_free_port(self):
        """Trouve un port libre pour le serveur"""
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            return s.getsockname()[1]

    def create_server(self, name, version, ram_min="1G", ram_max="2G", storage_limit=None, base_path=None, server_type="paper", loader_version=None, forge_version=None, owner="admin"):
        """Crée un nouveau serveur Docker"""
        # Utiliser le base_path personnalisé si fourni
        if base_path:
            server_base = os.path.abspath(base_path)
            os.makedirs(server_base, exist_ok=True)
        else:
            server_base = self.base_dir
        
        # Valider et créer le chemin du serveur
        name = self._validate_name(name)
        path = os.path.join(server_base, name)
        
        if os.path.exists(path):
            raise Exception("Ce nom existe déjà")
        
        # Structure de dossiers
        os.makedirs(path)
        data_dir = os.path.join(path, "data")
        os.makedirs(data_dir)
        
        # Création des dossiers mods/plugins pour que l'utilisateur puisse les voir vide
        os.makedirs(os.path.join(data_dir, "plugins"), exist_ok=True)
        os.makedirs(os.path.join(data_dir, "mods"), exist_ok=True)

        print(f"[INFO] Configuration Docker pour {server_type.title()} {version}...")
        
        # Allocation port
        port = 25565
        for p in range(25565, 25700):
            if not self._is_port_in_use(p):
                port = p
                break
        
        # UID/GID pour permissions
        uid = os.getuid()
        gid = os.getgid()
        
        # Generer ID Unique
        self.server_id = str(uuid.uuid4())[:8]

        # Configuration Docker Compose
        compose_config = {
            "version": "3.8",
            "services": {
                "mc": {
                    "image": "itzg/minecraft-server",
                    "container_name": f"mc-{name}",
                    "tty": True,
                    "stdin_open": True,
                    "ports": [f"{port}:25565"],
                    "labels": {
                        "com.mcpanel.owner": owner,
                        "com.mcpanel.server": name,
                        "com.mcpanel.id": self.server_id
                    },
                    "security_opt": ["no-new-privileges:true"],
                    "cap_drop": ["ALL"],
                    "cap_add": ["CHOWN", "SETGID", "SETUID", "DAC_OVERRIDE"], # Requis pour itzg/minecraft-server
                    # "read_only": True, # A tester avec le volume /data
                    "logging": {
                        "driver": "json-file",
                        "options": {
                            "max-size": "10m",
                            "max-file": "3"
                        }
                    },
                    "environment": {
                        "EULA": "TRUE",
                        "VERSION": version,
                        "TYPE": server_type.upper(),
                        "MEMORY": ram_max,
                        "INIT_MEMORY": ram_min,
                        "UID": str(uid),
                        "GID": str(gid),
                        "TZ": "Europe/Paris"
                    },
                    "volumes": [
                        "./data:/data"
                    ],
                    "restart": "unless-stopped",
                    # Healthcheck auto-healing
                    "healthcheck": {
                        "test": "mc-health",
                        "interval": "10s",
                        "start_period": "60s",
                        "retries": 10
                    }
                }
            }
        }
        
        # Options spécifiques
        if server_type == "forge" and forge_version:
             compose_config["services"]["mc"]["environment"]["FORGE_VERSION"] = forge_version
        elif server_type == "fabric" and loader_version:
             compose_config["services"]["mc"]["environment"]["FABRIC_LOADER_VERSION"] = loader_version
        
        # Écriture du docker-compose.yml
        with open(os.path.join(path, "docker-compose.yml"), "w") as f:
            yaml.dump(compose_config, f)

        # Config Manager
        config = {
            "id": self.server_id,
            "ram_min": ram_min,
            "ram_max": ram_max,
            "version": version,
            "server_type": server_type,
            "created_at": datetime.now().isoformat(),
            "owner": owner,
            "port": port,
            "mode": "docker",
            "compose_file": "docker-compose.yml"
        }
        
        if loader_version:
            config["loader_version"] = loader_version
        if forge_version:
            config["forge_version"] = forge_version
        
        self.save_server_config(name, config)
        print(f"[INFO] Serveur {name} créé avec succès (Port: {port})")

    # Ancienne methode de download supprimee/remplacee par Docker qui gere tout
    

    def action(self, name, action):
        if action == "start":
            self.start(name)
        elif action == "stop":
            self.stop(name)
        elif action == "restart":
            # Optimisation: Utiliser le restart natif Docker si disponible
            path = self._get_server_path(name)
            if os.path.exists(os.path.join(path, "docker-compose.yml")):
                self.webhook_mgr.dispatch("server.restarting", {"server": name})
                try:
                    subprocess.run(["docker", "compose", "restart"], cwd=path, check=True)
                    print(f"[INFO] Serveur {name} redémarré (Docker Native)")
                except Exception as e:
                    print(f"[ERROR] Restart Docker échoué, fallback sur stop/start: {e}")
                    self.stop(name)
                    time.sleep(2)
                    self.start(name)
            else:
                self.stop(name)
                time.sleep(3)
                self.start(name)
        elif action == "kill":
            self.kill(name)

    def _is_port_in_use(self, port):
        """Vérifie si un port est déjà utilisé"""
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('localhost', port)) == 0
    
    def start(self, name):
        """Démarre un serveur (Docker ou Legacy)"""
        self.webhook_mgr.dispatch("server.starting", {"server": name})
        
        path = self._get_server_path(name)
        if not os.path.exists(path):
            raise Exception(f"Le serveur '{name}' n'existe pas")
            
        # 1. Mode Docker (Prioritaire)
        if os.path.exists(os.path.join(path, "docker-compose.yml")):
            if self.is_running(name):
                return
            
            print(f"[INFO] Démarrage Docker pour {name}...")
            try:
                # Security Check: Verify file permissions before start
                data_dir = os.path.join(path, "data")
                if os.path.exists(data_dir):
                    # Ensure plugins/mods dirs exist
                    os.makedirs(os.path.join(data_dir, "plugins"), exist_ok=True)
                    os.makedirs(os.path.join(data_dir, "mods"), exist_ok=True)
                
                # Up -d
                subprocess.run(
                    ["docker", "compose", "up", "-d"], 
                    cwd=path, 
                    check=True,
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE
                )
                print(f"[INFO] Conteneur démarré pour {name}")
                return
            except subprocess.CalledProcessError as e:
                err = e.stderr.decode() if e.stderr else str(e)
                raise Exception(f"Erreur Docker: {err}")

        # 2. Mode Legacy (Processus Local)
        if self.is_running(name):
            return
        
        if not os.path.exists(os.path.join(path, "server.jar")):
             # Peut-être il a été supprimé ou c'est un serveur docker mal configuré
             raise Exception(f"server.jar introuvable pour '{name}'")
        
        config = self.get_server_config(name)
        
        # Vérifier si le port est disponible
        port = int(config.get('port', 25565))
        if self._is_port_in_use(port):
            raise Exception(f"Port {port} déjà utilisé.")
        
        # Vérifier/télécharger Java si nécessaire
        java_path = config.get("java_path", "java")
        mc_version = config.get("version")
        
        # (Legacy java check code omitted for brevity but maintained logic if strictly needed, 
        # normally new servers use Docker so this is fallback)
        if mc_version and java_path != "java" and not os.path.exists(java_path):
             java_path = self.ensure_java_for_version(mc_version)

        cmd = [
            java_path,
            f"-Xms{config.get('ram_min', '1G')}",
            f"-Xmx{config.get('ram_max', '2G')}",
            "-Dfile.encoding=UTF-8",
        ]
        
        jvm_flags = config.get("java_flags", [])
        if jvm_flags: cmd.extend(jvm_flags)
            
        cmd.extend(["-jar", "server.jar", "nogui"])
        
        extra_args = config.get("extra_args", [])
        if extra_args: cmd.extend(extra_args)

        log_path = os.path.join(path, "latest.log")
        log_file = open(log_path, "w", encoding="utf-8")
        self.log_files[name] = log_file

        flags = 0
        if platform.system() == "Windows":
            flags = subprocess.CREATE_NO_WINDOW

        try:
            self.procs[name] = subprocess.Popen(
                cmd, cwd=path, stdin=subprocess.PIPE, stdout=log_file,
                stderr=subprocess.STDOUT, text=True, creationflags=flags,
            )
            print(f"[INFO] Serveur Legacy {name} démarré")
        except Exception as e:
            log_file.close()
            del self.log_files[name]
            raise Exception(f"Erreur démarrage legacy: {e}")

    def stop(self, name):
        self.webhook_mgr.dispatch("server.stop", {"server": name})
        path = self._get_server_path(name)

        # 1. Docker
        if os.path.exists(os.path.join(path, "docker-compose.yml")):
            try:
                subprocess.run(["docker", "compose", "stop"], cwd=path, check=False)
            except Exception as e:
                print(f"[WARN] Erreur stop docker {name}: {e}")
            return

        # 2. Legacy
        if self.is_running(name) and name in self.procs:
            try:
                self.procs[name].stdin.write("stop\n")
                self.procs[name].stdin.flush()
                for _ in range(30):
                    if self.procs[name].poll() is not None: break
                    time.sleep(1)
                else:
                    self.procs[name].kill()
            except Exception:
                self.procs[name].kill()
            finally:
                self._cleanup_process(name)

    def kill(self, name):
        path = self._get_server_path(name)
        # Docker
        if os.path.exists(os.path.join(path, "docker-compose.yml")):
            subprocess.run(["docker", "compose", "kill"], cwd=path, check=False)
            return
        
        # Legacy
        if name in self.procs:
            try:
                self.procs[name].kill()
            except: pass
            finally:
                self._cleanup_process(name)

    def _cleanup_process(self, name):
        if name in self.procs: del self.procs[name]
        if name in self.log_files:
            try: self.log_files[name].close()
            except: pass
            del self.log_files[name]

    def delete_server(self, name):
        path = self._get_server_path(name)
        if not os.path.exists(path): raise Exception("Serveur introuvable")
        
        # Docker Down -v (remove volumes)
        if os.path.exists(os.path.join(path, "docker-compose.yml")):
             subprocess.run(["docker", "compose", "down", "-v"], cwd=path, check=False)
        else:
             if self.is_running(name): self.stop(name)
             self.kill(name)
        
        time.sleep(1)
        shutil.rmtree(path, ignore_errors=True)
        print(f"[INFO] Serveur {name} supprimé")

    def is_running(self, name):
        # 1. Check Docker
        path = self._get_server_path(name)
        if os.path.exists(os.path.join(path, "docker-compose.yml")):
            # Check if container mc-<name> is running
            # Utilisation simple: docker ps -q -f name=mc-<name>
            try:
                res = subprocess.run(
                    ["docker", "ps", "-q", "-f", f"name=mc-{name}", "-f", "status=running"],
                    stdout=subprocess.PIPE, text=True
                )
                return bool(res.stdout.strip())
            except:
                return False
        
        # 2. Check Legacy
        return name in self.procs and self.procs[name].poll() is None

    def get_status(self, name):
        """Retourne le statut complet du serveur avec métriques"""
        is_running = self.is_running(name)
        status = {
            "status": "online" if is_running else "offline",
            "running": is_running,
            "cpu": 0, "ram": 0, "ram_mb": 0, "pid": None
        }
        
        path = self._get_server_path(name)
        
        # Docker Stats
        if os.path.exists(os.path.join(path, "docker-compose.yml")) and is_running:
            try:
                # Docker stats --no-stream --format json
                res = subprocess.run(
                    ["docker", "stats", f"mc-{name}", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}"],
                    stdout=subprocess.PIPE, text=True
                )
                output = res.stdout.strip()
                if output:
                    parts = output.split("|")
                    if len(parts) == 2:
                        cpu_str = parts[0].replace('%', '')
                        mem_str = parts[1].split('/')[0].strip() # "100MiB"
                        
                        status["cpu"] = float(cpu_str)
                        # Parsing rapide mem
                        if "Gc" in mem_str or "GiB" in mem_str:
                            val = float(re.sub(r'[a-zA-Z]', '', mem_str)) * 1024
                        elif "Mc" in mem_str or "MiB" in mem_str:
                            val = float(re.sub(r'[a-zA-Z]', '', mem_str))
                        else:
                            val = 0
                        status["ram_mb"] = val
                        status["pid"] = "Docker"
            except Exception as e:
                # print(f"Err stats docker: {e}")
                pass
            return status

        # Legacy Stats
        if is_running and name in self.procs:
            try:
                pid = self.procs[name].pid
                status["pid"] = pid
                proc = psutil.Process(pid)
                status["cpu"] = round(proc.cpu_percent(interval=0.1), 1)
                mem_info = proc.memory_info()
                status["ram_mb"] = round(mem_info.rss / 1024 / 1024, 1)
            except: pass
        
        return status
    
    def send_command(self, name, cmd):
        if not cmd or not cmd.strip(): return
        
        path = self._get_server_path(name)
        if os.path.exists(os.path.join(path, "docker-compose.yml")):
            if self.is_running(name):
                 # Securite: Utilisation de la liste d'arguments pour eviter l'injection Shell
                 # rcon-cli est inclus dans l'image itzg/minecraft-server
                 try:
                    subprocess.run(["docker", "exec", "-i", f"mc-{name}", "rcon-cli", cmd], check=False)
                 except Exception as e:
                    print(f"[ERROR] Echec commande Docker {name}: {e}")
            return

        if self.is_running(name):
            try:
                self.procs[name].stdin.write(cmd.strip() + "\n")
                self.procs[name].stdin.flush()
            except: pass

    def get_logs(self, name, lines=100, filter_type=None, search=None):
        try:
            path = self._get_server_path(name)
            logs_content = []

            # 1. Docker Logs
            if os.path.exists(os.path.join(path, "docker-compose.yml")):
                try:
                    # Récupère les logs du conteneur via Docker CLI
                    # --tail pour optimiser
                    res = subprocess.run(
                        ["docker", "logs", "--tail", str(lines), f"mc-{name}"],
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                        errors="replace"
                    )
                    if res.returncode == 0:
                        logs_content = res.stdout.splitlines()
                except Exception as e:
                    print(f"[WARN] Erreur lecture logs Docker {name}: {e}")
            
            # 2. File Logs (Legacy ou Fallback)
            if not logs_content:
                # Docker: data/logs/latest.log ou data/latest.log
                # Legacy: latest.log
                candidates = [
                    os.path.join(path, "latest.log"),
                    os.path.join(path, "logs", "latest.log"),
                    os.path.join(path, "data", "latest.log"),
                    os.path.join(path, "data", "logs", "latest.log")
                ]
                
                log_path = None
                for c in candidates:
                    if os.path.exists(c):
                        log_path = c
                        break
                
                if log_path:
                    from collections import deque
                    try:
                        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                            tail = deque(f, maxlen=lines)
                            logs_content = [l.rstrip("\n") for l in tail]
                    except: pass

            # Apply filters
            result = logs_content
            
            if filter_type:
                ft = filter_type.lower()
                if ft in ("error", "err"):
                    result = [l for l in result if "error" in l.lower() or "exception" in l.lower()]
                elif ft in ("warn", "warning"):
                    result = [l for l in result if "warn" in l.lower()]
                elif ft in ("info",):
                    result = [l for l in result if "info" in l.lower()]

            if search:
                q = search.lower()
                result = [l for l in result if q in l.lower()]

            return result
        except Exception as e:
            print(f"[WARN] Erreur lecture logs: {e}")
            return []

    def get_logs_files(self, name):
        """Liste les fichiers de logs (latest + archived)"""
        path = self._get_server_path(name)
        logs_dir = os.path.join(path, "logs")
        files = []

        # Latest.log
        latest = os.path.join(path, "latest.log")
        if os.path.exists(latest):
            files.append({"name": "latest.log", "path": "latest.log", "size": os.path.getsize(latest)})

        # Archived logs
        if os.path.exists(logs_dir):
            for fname in os.listdir(logs_dir):
                fp = os.path.join(logs_dir, fname)
                if os.path.isfile(fp):
                    files.append({"name": fname, "path": f"logs/{fname}", "size": os.path.getsize(fp)})

        return sorted(files, key=lambda x: x["name"], reverse=True)

    def get_properties(self, name):
        props = {}
        try:
            path = self._get_server_path(name)
            # Docker path priority
            props_path = os.path.join(path, "data", "server.properties")
            if not os.path.exists(props_path):
                 # Fallback Legacy
                 props_path = os.path.join(path, "server.properties")
            
            if os.path.exists(props_path):
                with open(props_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if "=" in line and not line.startswith("#"):
                            key, value = line.split("=", 1)
                            props[key] = value
        except Exception as e:
            print(f"[WARN] Erreur lecture properties: {e}")
        
        return props

    def save_properties(self, name, props):
        try:
            path = self._get_server_path(name)
            
            # Determine path based on existing file or server structure
            if os.path.exists(os.path.join(path, "docker-compose.yml")) or os.path.exists(os.path.join(path, "data")):
                 props_path = os.path.join(path, "data", "server.properties")
                 os.makedirs(os.path.dirname(props_path), exist_ok=True)
            else:
                 props_path = os.path.join(path, "server.properties")
            
            with open(props_path, "w", encoding="utf-8") as f:
                f.write("# Minecraft Server Properties\n")
                f.write(f"# Modifié le {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                for key, value in props.items():
                    f.write(f"{key}={value}\n")
            
            return True
        except Exception as e:
            print(f"[ERROR] Erreur sauvegarde properties: {e}")
            raise Exception(f"Erreur sauvegarde: {e}")

    def backup_server(self, name):
        """Crée une sauvegarde compressée du serveur (Smart Backup)"""
        path = self._get_server_path(name)
        backup_dir = os.path.join(self.base_dir, "_backups")
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{name}_{timestamp}.zip"
        backup_path = os.path.join(backup_dir, backup_name)
        
        # 1. Sauvegarde en jeu (Flush to disk)
        if self.is_running(name):
            print(f"[BACKUP] Forçage de la sauvegarde pour {name}")
            self.send_command(name, "save-all")
            # Attendre l'écriture disque
            time.sleep(5)
            # Désactiver l'autosave pour éviter les incohérences pendant le zip
            self.send_command(name, "save-off")
        
        try:
            print(f"[INFO] Création backup ZIP pour {name}...")
            with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, dirs, files in os.walk(path):
                     # Exclusions intelligentes (logs archivés, backups récursifs...)
                     if "logs" in root and root != os.path.join(path, "logs"):
                         continue # Skip sub-logs
                     
                     for file in files:
                         if file.endswith(".zip") and root == path: 
                             continue # Skip backups in root
                         if file.endswith(".log.gz"):
                             continue # Skip archived logs
                             
                         abs_path = os.path.join(root, file)
                         rel_path = os.path.relpath(abs_path, start=path)
                         zf.write(abs_path, arcname=rel_path)
            
            print(f"[INFO] Backup ZIP créé: {backup_name}")
            return {"success": True, "name": backup_name, "path": backup_path}
            
        except Exception as e:
            if os.path.exists(backup_path):
                os.remove(backup_path)
            raise Exception(f"Erreur backup: {e}")
            
        finally:
            if self.is_running(name):
                self.send_command(name, "save-on")

    def update_docker_resources(self, name, port=None, ram_max=None, ram_min=None, cpu_limit=None):
        """Met à jour les ressources Docker (Port, RAM, CPU)"""
        path = self._get_server_path(name)
        compose_path = os.path.join(path, "docker-compose.yml")
        
        if not os.path.exists(compose_path):
            raise Exception("Ce serveur n'est pas géré par Docker (legacy)")

        try:
            with open(compose_path, "r") as f:
                compose = yaml.safe_load(f)
            
            # Update Port
            if port:
                compose["services"]["mc"]["ports"] = [f"{port}:25565"]
            
            # Update RAM
            if ram_max:
                compose["services"]["mc"]["environment"]["MEMORY"] = ram_max
            if ram_min:
                compose["services"]["mc"]["environment"]["INIT_MEMORY"] = ram_min
            
            # Update CPU (requires version removal or proper deploy key, but we stick to standard service/deploy for now
            # Note: CPU limits in compose v3+ usually inside deploy.resources.limits
            # But simple environment variables or flags are not standard for CPU, except CPUS maybe?
            # actually itzg image doesn't enforce CPU via env, we must set it in compose structure.
            # Assuming simple structure:
            if cpu_limit or ram_max:
                 if "deploy" not in compose["services"]["mc"]:
                     compose["services"]["mc"]["deploy"] = {"resources": {"limits": {}}}
                 
                 if cpu_limit:
                     compose["services"]["mc"]["deploy"]["resources"]["limits"]["cpus"] = str(cpu_limit)
                 if ram_max:
                     # Conversion format Java (2G) -> Docker (2G) Usually matches
                     compose["services"]["mc"]["deploy"]["resources"]["limits"]["memory"] = ram_max

            # Save docker-compose.yml
            with open(compose_path, "w") as f:
                yaml.dump(compose, f)
            
            # Update manager_config.json
            cfg = self.get_server_config(name)
            if port: cfg["port"] = int(port)
            if ram_max: cfg["ram_max"] = ram_max
            if ram_min: cfg["ram_min"] = ram_min
            self.save_server_config(name, cfg)

            print(f"[INFO] Ressources mises à jour pour {name}")
            
            # Apply changes immediately
            try:
                subprocess.run(["docker", "compose", "up", "-d"], cwd=path, check=True)
                print(f"[INFO] Docker compose reload effectué pour {name}")
            except Exception as e:
                print(f"[WARN] Failed to reload docker compose: {e}")

            return True
        except Exception as e:
            print(f"[ERROR] Update resources failed: {e}")
            raise Exception(f"Echec mise à jour: {e}")

    def get_docker_resources(self, name):
        """Récupère la configuration Docker actuelle (Port, RAM, CPU)"""
        path = self._get_server_path(name)
        compose_path = os.path.join(path, "docker-compose.yml")
        
        if not os.path.exists(compose_path):
            return {}

        try:
            with open(compose_path, "r") as f:
                compose = yaml.safe_load(f)
            
            mc = compose.get("services", {}).get("mc", {})
            env = mc.get("environment", {})
            deploy = mc.get("deploy", {}).get("resources", {}).get("limits", {})
            
            host_port = "25565"
            ports = mc.get("ports", [])
            if ports:
                p = ports[0]
                if isinstance(p, str):
                    host_port = p.split(":")[0]
                elif isinstance(p, dict):
                    host_port = p.get("published", "25565")
            
            return {
                "port": host_port,
                "ram_max": env.get("MEMORY", "2G"),
                "ram_min": env.get("INIT_MEMORY", "1G"),
                "cpu_limit": str(deploy.get("cpus", "")),
                "restart_policy": mc.get("restart", "unless-stopped")
            }
        except Exception as e:
            print(f"[WARN] Error reading config for {name}: {e}")
            return {}

    def list_backups(self, name=None):
        """Liste les sauvegardes disponibles"""
        backup_dir = os.path.join(self.base_dir, "_backups")
        if not os.path.exists(backup_dir):
            return []
        
        backups = []
        for d in os.listdir(backup_dir):
            if name and not d.startswith(name + "_"):
                continue
            full_path = os.path.join(backup_dir, d)
            if os.path.isfile(full_path) or os.path.isdir(full_path):
                stat = os.stat(full_path)
                
                size_mb = 0
                if os.path.isdir(full_path):
                    size_mb = sum(
                        os.path.getsize(os.path.join(dirpath, filename))
                        for dirpath, _, filenames in os.walk(full_path)
                        for filename in filenames
                    ) / 1024 / 1024
                else:
                    size_mb = stat.st_size / 1024 / 1024

                backups.append({
                    "name": d,
                    "date": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size_mb": round(size_mb, 1)
                })
        
        return sorted(backups, key=lambda x: x["date"], reverse=True)
    
    # World management
    def list_worlds(self, server_name):
        server_dir = os.path.join(self.servers_dir, server_name)
        if not os.path.exists(server_dir):
            return []
        
        worlds = []
        for item in os.listdir(server_dir):
            item_path = os.path.join(server_dir, item)
            # Minecraft worlds have level.dat
            level_dat = os.path.join(item_path, "level.dat")
            if os.path.isdir(item_path) and os.path.exists(level_dat):
                stat = os.stat(level_dat)
                size = sum(
                    os.path.getsize(os.path.join(dp, f))
                    for dp, _, fns in os.walk(item_path)
                    for f in fns
                )
                worlds.append({
                    "name": item,
                    "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size_mb": round(size / 1024 / 1024, 1)
                })
        return worlds
    
    def reset_world(self, server_name, world_name="world"):
        server_dir = os.path.join(self.servers_dir, server_name)
        world_path = os.path.join(server_dir, world_name)
        
        if not os.path.exists(world_path):
            return False, "World not found"
        
        # Backup before reset
        backup_name = f"{world_name}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        backup_path = os.path.join(server_dir, backup_name)
        shutil.copytree(world_path, backup_path)
        
        # Delete world
        shutil.rmtree(world_path)
        return True, f"World reset. Backup: {backup_name}"
    
    def export_world(self, server_name, world_name):
        server_dir = os.path.join(self.servers_dir, server_name)
        world_path = os.path.join(server_dir, world_name)
        
        if not os.path.exists(world_path):
            return None
        
        # Create zip in temp
        import tempfile
        import zipfile
        
        zip_path = os.path.join(tempfile.gettempdir(), f"{world_name}.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(world_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, world_path)
                    zf.write(file_path, arcname)
        
        return zip_path
    
    def import_world(self, server_name, zip_file, world_name=None):
        import zipfile
        
        server_dir = os.path.join(self.servers_dir, server_name)
        if not os.path.exists(server_dir):
            return False, "Server not found"
        
        # Determine world name from zip or use provided
        if not world_name:
            world_name = os.path.splitext(os.path.basename(zip_file.filename))[0]
        
        world_path = os.path.join(server_dir, world_name)
        
        # Don't overwrite existing
        if os.path.exists(world_path):
            return False, "World already exists"
        
        os.makedirs(world_path)
        
        with zipfile.ZipFile(zip_file, 'r') as zf:
            zf.extractall(world_path)
        
        return True, f"World imported: {world_name}"
    
    # Whitelist management
    def get_whitelist(self, server_name):
        wl_path = os.path.join(self.servers_dir, server_name, "whitelist.json")
        if not os.path.exists(wl_path):
            return []
        with open(wl_path, 'r') as f:
            return json.load(f)
    
    def add_to_whitelist(self, server_name, username, uuid=None):
        wl_path = os.path.join(self.servers_dir, server_name, "whitelist.json")
        whitelist = self.get_whitelist(server_name)
        
        # Check if already exists
        for entry in whitelist:
            if entry.get("name", "").lower() == username.lower():
                return False, "Already whitelisted"
        
        # Fetch UUID from Mojang if not provided
        if not uuid:
            try:
                resp = requests.get(f"https://api.mojang.com/users/profiles/minecraft/{username}")
                if resp.status_code == 200:
                    uuid = resp.json().get("id")
                    # Format UUID with dashes
                    uuid = f"{uuid[:8]}-{uuid[8:12]}-{uuid[12:16]}-{uuid[16:20]}-{uuid[20:]}"
            except:
                pass
        
        whitelist.append({"uuid": uuid or "", "name": username})
        with open(wl_path, 'w') as f:
            json.dump(whitelist, f, indent=2)
        
        return True, "Added"
    
    def remove_from_whitelist(self, server_name, username):
        wl_path = os.path.join(self.servers_dir, server_name, "whitelist.json")
        whitelist = self.get_whitelist(server_name)
        
        new_list = [e for e in whitelist if e.get("name", "").lower() != username.lower()]
        if len(new_list) == len(whitelist):
            return False, "Not found"
        
        with open(wl_path, 'w') as f:
            json.dump(new_list, f, indent=2)
        
        return True, "Removed"
    
    # Disk usage
    def get_disk_usage(self, server_name):
        server_dir = os.path.join(self.servers_dir, server_name)
        if not os.path.exists(server_dir):
            return None
        
        total = 0
        breakdown = {"worlds": 0, "plugins": 0, "logs": 0, "other": 0}
        
        for root, dirs, files in os.walk(server_dir):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    size = os.path.getsize(fp)
                    total += size
                    
                    rel = os.path.relpath(root, server_dir)
                    if rel.startswith("world") or "level.dat" in f:
                        breakdown["worlds"] += size
                    elif rel.startswith("plugins"):
                        breakdown["plugins"] += size
                    elif rel.startswith("logs") or f.endswith(".log"):
                        breakdown["logs"] += size
                    else:
                        breakdown["other"] += size
                except:
                    pass
        
        return {
            "total_mb": round(total / 1024 / 1024, 1),
            "breakdown": {k: round(v / 1024 / 1024, 1) for k, v in breakdown.items()}
        }
    
    # Resource packs
    def get_resource_pack_config(self, server_name):
        props = self.get_properties(server_name)
        return {
            "url": props.get("resource-pack", ""),
            "sha1": props.get("resource-pack-sha1", ""),
            "required": props.get("require-resource-pack", "false") == "true"
        }
    
    def set_resource_pack(self, server_name, url, sha1="", required=False):
        props = self.get_properties(server_name)
        props["resource-pack"] = url
        props["resource-pack-sha1"] = sha1
        props["require-resource-pack"] = "true" if required else "false"
        self.save_properties(server_name, props)
        return True
    
    # Datapacks
    def list_datapacks(self, server_name, world_name="world"):
        dp_path = os.path.join(self.servers_dir, server_name, world_name, "datapacks")
        if not os.path.exists(dp_path):
            return []
        
        packs = []
        for item in os.listdir(dp_path):
            item_path = os.path.join(dp_path, item)
            is_zip = item.endswith(".zip")
            
            # Get pack.mcmeta for info
            meta = {}
            if is_zip:
                import zipfile
                try:
                    with zipfile.ZipFile(item_path, 'r') as zf:
                        if "pack.mcmeta" in zf.namelist():
                            meta = json.loads(zf.read("pack.mcmeta"))
                except:
                    pass
            else:
                meta_path = os.path.join(item_path, "pack.mcmeta")
                if os.path.exists(meta_path):
                    with open(meta_path) as f:
                        try:
                            meta = json.load(f)
                        except:
                            pass
            
            packs.append({
                "name": item,
                "is_zip": is_zip,
                "description": meta.get("pack", {}).get("description", ""),
                "format": meta.get("pack", {}).get("pack_format", 0)
            })
        
        return packs
    

    def add_datapack(self, server_name, file, world_name="world"):
        dp_path = os.path.join(self.servers_dir, server_name, world_name, "datapacks")
        os.makedirs(dp_path, exist_ok=True)
        
        dest = os.path.join(dp_path, file.filename)
        file.save(dest)
        return True
    
    def remove_datapack(self, server_name, pack_name, world_name="world"):
        dp_path = os.path.join(self.servers_dir, server_name, world_name, "datapacks", pack_name)
        if os.path.isdir(dp_path):
            shutil.rmtree(dp_path)
        elif os.path.isfile(dp_path):
            os.remove(dp_path)
        else:
            return False
        return True
    
    # File browser
    def browse_files(self, server_name, path=""):
        server_dir = os.path.join(self.servers_dir, server_name)
        target = os.path.normpath(os.path.join(server_dir, path))
        
        # Security: ensure we stay inside server dir
        if not target.startswith(server_dir):
            return None, "Access denied"
        
        if not os.path.exists(target):
            return None, "Not found"
        
        items = []
        for item in os.listdir(target):
            item_path = os.path.join(target, item)
            is_dir = os.path.isdir(item_path)
            stat = os.stat(item_path)
            
            items.append({
                "name": item,
                "is_dir": is_dir,
                "size": stat.st_size if not is_dir else None,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
        
        # Sort: folders first, then by name
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return items, None
    
    def read_file(self, server_name, path):
        server_dir = os.path.join(self.servers_dir, server_name)
        target = os.path.normpath(os.path.join(server_dir, path))
        
        if not target.startswith(server_dir):
            return None, "Access denied"
        
        if not os.path.isfile(target):
            return None, "Not a file"
        
        # Limit file size to 1MB for reading
        if os.path.getsize(target) > 1024 * 1024:
            return None, "File too large"
        
        try:
            with open(target, 'r', encoding='utf-8', errors='replace') as f:
                return f.read(), None
        except:
            return None, "Cannot read file"
    
    def write_file(self, server_name, path, content):
        server_dir = os.path.join(self.servers_dir, server_name)
        target = os.path.normpath(os.path.join(server_dir, path))
        
        if not target.startswith(server_dir):
            return False, "Access denied"
        
        try:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(content)
            return True, None
        except Exception as e:
            return False, str(e)

    # ==========================
    # MOD MANAGER (Modrinth)
    # ==========================
    
    def search_mods(self, query, limit=10):
        url = "https://api.modrinth.com/v2/search"
        params = {
            "query": query,
            "limit": limit,
            "facets": '[["project_type:mod"]]'
        }
        headers = {
            "User-Agent": "MCPanel/2.0 (github.com/mcpanel-pro)"
        }
        
        try:
            r = requests.get(url, params=params, headers=headers, timeout=10)
            r.raise_for_status()
            data = r.json()
            return data.get("hits", [])
        except Exception as e:
            print(f"[Mods] Search error: {e}")
            return []

    def install_mod(self, server_name, project_id, version_id=None):
        server_path = self._get_server_path(server_name)
        mods_dir = os.path.join(server_path, "mods")
        os.makedirs(mods_dir, exist_ok=True)
        
        headers = {
            "User-Agent": "MCPanel/2.0 (github.com/mcpanel-pro)"
        }
        
        try:
            # 1. Get version info
            if version_id:
                version_url = f"https://api.modrinth.com/v2/version/{version_id}"
                r = requests.get(version_url, headers=headers)
                r.raise_for_status()
                version_data = r.json()
            else:
                # Picker auto: trouver une version compatible
                cfg = self.get_server_config(server_name)
                mc_v = cfg.get("version")
                loader = cfg.get("server_type") # paper n'a pas de mods jar comme forge/fabric mais bon
                
                versions_url = f"https://api.modrinth.com/v2/project/{project_id}/version"
                r = requests.get(versions_url, headers=headers)
                r.raise_for_status()
                all_versions = r.json()
                
                version_data = None
                if mc_v:
                    # Chercher correspondance exacte
                    for v in all_versions:
                        if mc_v in v.get("game_versions", []) and (not loader or loader in v.get("loaders", [])):
                            version_data = v
                            break
                
                if not version_data and all_versions:
                    version_data = all_versions[0] # Fallback latest
                
                if not version_data:
                    return False, "No compatible versions found"
            
            # 2. Get download URL
            files = version_data.get("files", [])
            if not files:
                 return False, "No files found for this version"
            
            file_info = files[0]
            download_url = file_info["url"]
            filename = secure_filename(file_info["filename"])
            
            # 3. Download
            dest = os.path.join(mods_dir, filename)
            
            print(f"[Mods] Downloading {filename} to {dest}...")
            with requests.get(download_url, stream=True) as r:
                r.raise_for_status()
                with open(dest, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                        
            return True, f"Mod {filename} installé!"
            
        except Exception as e:
            return False, str(e)
    # ==========================
    # OPTIMIZATION
    # ==========================
    def optimize_server(self, name):
        """Applique les drapeaux Aikar's Flags optimisés"""
        config = self.get_server_config(name)
        
        # Aikar's Flags (Standard for G1GC)
        # https://docs.papermc.io/paper/aikars-flags
        aikar_flags = [
            "-XX:+UseG1GC",
            "-XX:+ParallelRefProcEnabled",
            "-XX:MaxGCPauseMillis=200",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+DisableExplicitGC",
            "-XX:+AlwaysPreTouch",
            "-XX:G1NewSizePercent=30",
            "-XX:G1MaxNewSizePercent=40",
            "-XX:G1HeapRegionSize=8M",
            "-XX:G1ReservePercent=20",
            "-XX:G1HeapWastePercent=5",
            "-XX:G1MixedGCCountTarget=4",
            "-XX:InitiatingHeapOccupancyPercent=15",
            "-XX:G1MixedGCLiveThresholdPercent=90",
            "-XX:G1RSetUpdatingPauseTimePercent=5",
            "-XX:SurvivorRatio=32",
            "-XX:+PerfDisableSharedMem",
            "-XX:MaxTenuringThreshold=1",
            "-Dusing.aikars.flags=https://mcflags.emc.gs",
            "-Daikars.new.flags=true"
        ]
        
        config["java_flags"] = aikar_flags
        self.save_server_config(name, config)
        return True, "Optimisations (Aikar's Flags) appliquées avec succès."

    def find_available_port(self, start=25565):
        import socket
        port = start
        while port < 65535:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            if result != 0:
                # Also check if another server uses it
                in_use = False
                for srv in self.list_servers():
                    props = self.get_properties(srv["name"])
                    if props.get("server-port") == str(port):
                        in_use = True
                        break
                if not in_use:
                    return port
            port += 1
        return None
