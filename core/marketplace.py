import requests
import logging
from core.api_cache import cache

logger = logging.getLogger(__name__)

class MarketplaceManager:
    """
    Gère la recherche et l'installation de plugins/mods depuis Modrinth (API v2).
    """
    
    BASE_URL = "https://api.modrinth.com/v2"

    def search_plugins(self, query, loader="paper", limit=10):
        cache_key = f"market_search_{loader}_{query}"
        cached = cache.get(cache_key)
        if cached: return cached

        facets = [f"categories:{loader}"] if loader else []
        
        try:
            params = {
                "query": query,
                "limit": limit,
                "facets": str([facets]).replace("'", '"') # Modrinth format [["categories:paper"]]
            }
            r = requests.get(f"{self.BASE_URL}/search", params=params, timeout=5)
            r.raise_for_status()
            data = r.json()
            
            results = []
            for hit in data.get("hits", []):
                results.append({
                    "id": hit["project_id"],
                    "title": hit["title"],
                    "desc": hit["description"],
                    "icon": hit["icon_url"],
                    "author": hit["author"],
                    "downloads": hit["downloads"]
                })
            
            cache.set(cache_key, results)
            return results
        except Exception as e:
            logger.info(f"Search failed: {e}")
            return []

    def get_plugin_versions(self, project_id):
        # Récupère les versions pour télécharger
        try:
            r = requests.get(f"{self.BASE_URL}/project/{project_id}/version", timeout=5)
            r.raise_for_status()
            return r.json()
        except:
            return []

    def install_plugin(self, server_path, project_id, version_id=None):
        """
        Télécharge et installe un plugin/mod dans le dossier approprié du serveur.
        """
        import os
        
        try:
            versions = self.get_plugin_versions(project_id)
            if not versions:
                raise Exception("Aucune version disponible pour ce projet")
            
            # Prendre la version spécifiée ou la dernière stable
            target_version = None
            if version_id:
                for v in versions:
                    if v['id'] == version_id:
                        target_version = v
                        break
            
            if not target_version:
                target_version = versions[0] # La plus récente
                
            # Trouver l'asset de téléchargement (le .jar de préférence)
            files = target_version.get('files', [])
            if not files:
                raise Exception("Aucun fichier trouvé dans cette version")
                
            download_url = files[0]['url']
            filename = files[0]['filename']
            
            # Déterminer le dossier de destination (plugins ou mods)
            # On vérifie si c'est un plugin ou un mod via loaders
            loaders = target_version.get('loaders', [])
            is_mod = any(l in loaders for l in ['forge', 'fabric', 'quilt', 'neoforge'])
            
            # Path context check for Docker vs Legacy
            target_dir = os.path.join(server_path, "data", "plugins" if not is_mod else "mods")
            if not os.path.exists(target_dir):
                # Fallback to direct path (Legacy servers)
                target_dir = os.path.join(server_path, "plugins" if not is_mod else "mods")
                
            os.makedirs(target_dir, exist_ok=True)
            
            # Télécharger
            r = requests.get(download_url, stream=True, timeout=30)
            r.raise_for_status()
            
            dest_path = os.path.join(target_dir, filename)
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
            
            return True, f"Installé dans {target_dir}"
        except Exception as e:
            return False, str(e)
