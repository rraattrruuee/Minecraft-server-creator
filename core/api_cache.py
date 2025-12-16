"""
Cache persistant pour APIs externes avec fallbacks robustes
"""
import json
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any


class APICache:
    """Cache persistant avec fallback pour APIs externes"""
    
    def __init__(self, cache_dir="data/api_cache"):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
    
    def get(self, key: str, max_age_hours: int = 24) -> Optional[Dict[str, Any]]:
        """Récupère depuis cache si < max_age"""
        cache_file = os.path.join(self.cache_dir, f"{key}.json")
        
        if not os.path.exists(cache_file):
            return None
        
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached = json.load(f)
            
            # Vérifier âge
            cached_time = datetime.fromisoformat(cached['timestamp'])
            if datetime.now() - cached_time < timedelta(hours=max_age_hours):
                print(f"[CACHE] Hit: {key} (age: {(datetime.now() - cached_time).seconds}s)")
                return cached['data']
            else:
                print(f"[CACHE] Expired: {key}")
        except Exception as e:
            print(f"[CACHE] Error reading {key}: {e}")
        
        return None
    
    def set(self, key: str, data: Any):
        """Sauvegarde dans cache"""
        cache_file = os.path.join(self.cache_dir, f"{key}.json")
        
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                }, f, indent=2)
            print(f"[CACHE] Saved: {key}")
        except Exception as e:
            print(f"[WARN] Erreur cache {key}: {e}")


# Instance globale
cache = APICache()
