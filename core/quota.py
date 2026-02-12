import json
import os
import time
from typing import Dict, Any

class QuotaManager:
    """
    Gère les quotas et limitations par rôle (CPU, RAM, Disque, Nombre de serveurs).
    """

    DEFAULTS = {
        "admin": {
            "max_servers": 100,
            "max_memory_mb": 128000,
            "max_cpu_cores": 32.0,
            "allow_custom_images": True
        },
        "user": {
            "max_servers": 3,
            "max_memory_mb": 8192,
            "max_cpu_cores": 4.0,
            "allow_custom_images": False
        },
        "guest": {
            "max_servers": 0,
            "max_memory_mb": 0,
            "max_cpu_cores": 0.0,
            "allow_custom_images": False
        }
    }

    def __init__(self, config_path="data/quotas.json"):
        self.config_path = config_path
        self.quotas = self._load_quotas()

    def _load_quotas(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    return json.load(f)
            except:
                pass
        return self.DEFAULTS

    def get_quota(self, role: str) -> Dict[str, Any]:
        return self.quotas.get(role, self.quotas["guest"])

    def check_resource_availability(self, user_role: str, current_usage: Dict, requested: Dict) -> Dict:
        """
        Vérifie si la création d'une ressource respecte les quotas.
        :return: {'allowed': bool, 'reason': str}
        """
        quota = self.get_quota(user_role)
        
        # 1. Check Server Count
        if current_usage.get('servers', 0) + 1 > quota['max_servers']:
            return {"allowed": False, "reason": f"Quota exceeded: Max {quota['max_servers']} servers allowed."}

        # 2. Check Memory
        req_mem = self._parse_memory(requested.get('memory', '2G'))
        used_mem = current_usage.get('memory_mb', 0)
        
        if used_mem + req_mem > quota['max_memory_mb']:
            return {"allowed": False, "reason": f"Quota exceeded: Not enough RAM (Max {quota['max_memory_mb']}MB)."}
            
        return {"allowed": True}

    def _parse_memory(self, mem_str: str) -> int:
        """Convertit '2G', '512M' en MB"""
        mem_str = str(mem_str).upper()
        if mem_str.endswith('G') or mem_str.endswith('GB'):
            return int(float(mem_str[:-1].strip('B')) * 1024)
        if mem_str.endswith('M') or mem_str.endswith('MB'):
            return int(float(mem_str[:-1].strip('B')))
        return 2048 # Default 2G
