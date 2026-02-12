import requests
from core.api_cache import cache

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
            print(f"[MARKET] Search failed: {e}")
            return []

    def get_plugin_versions(self, project_id):
        # Récupère les versions pour télécharger
        try:
            r = requests.get(f"{self.BASE_URL}/project/{project_id}/version", timeout=5)
            r.raise_for_status()
            return r.json()
        except:
            return []
