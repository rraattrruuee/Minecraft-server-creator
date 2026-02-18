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
                logger.debug(f"[CACHE] Hit: {key} (age: {(datetime.now() - cached_time).seconds}s)")
                return cached['data']
            else:
                logger.debug(f"[CACHE] Expired: {key}")
        except Exception as e:
            logger.warning(f"[CACHE] Error reading {key}: {e}")
        
        return None
    
    def set(self, key: str, data: Any, max_age_hours: Optional[int] = None):
        """Sauvegarde dans cache"""
        cache_file = os.path.join(self.cache_dir, f"{key}.json")
        
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                }, f, indent=2)
            logger.debug(f"[CACHE] Saved: {key}")
        except Exception as e:
            logger.warning(f"[WARN] Erreur cache {key}: {e}")

    def cleanup(self, max_age_days: int = 7):
        """Supprime les entrées de cache plus vieilles que max_age_days."""
        try:
            now = datetime.now()
            count = 0
            for filename in os.listdir(self.cache_dir):
                if filename.endswith(".json"):
                    filepath = os.path.join(self.cache_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            cached = json.load(f)
                        cached_time = datetime.fromisoformat(cached['timestamp'])
                        if now - cached_time > timedelta(days=max_age_days):
                            os.remove(filepath)
                            count += 1
                    except Exception:
                        # Si le fichier est corrompu, on le supprime
                        os.remove(filepath)
                        count += 1
            if count > 0:
                logger.info(f"[CACHE] Nettoyage : {count} fichiers supprimés")
        except Exception as e:
            logger.error(f"[CACHE] Erreur lors du nettoyage : {e}")


import logging
logger = logging.getLogger(__name__)

# Instance globale
cache = APICache()
