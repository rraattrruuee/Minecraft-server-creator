import json
import os
import time
from typing import Dict, Any
from core.utils import parse_size_to_mb

class QuotaManager:
    """
    Gère les quotas et limitations par rôle (CPU, RAM, Disque, Nombre de serveurs).
    """

    DEFAULTS = {
        "admin": {
            "max_servers": 100,
            "max_memory_mb": 128000,
            "max_cpu_cores": 32.0,
            "allow_custom_images": True,
            "allow_resource_edit": True
        },
        "user": {
            "max_servers": 3,
            "max_memory_mb": 8192,
            "max_cpu_cores": 4.0,
            "allow_custom_images": False,
            "allow_resource_edit": False
        },
        "guest": {
            "max_servers": 0,
            "max_memory_mb": 0,
            "max_cpu_cores": 0.0,
            "allow_custom_images": False,
            "allow_resource_edit": False
        }
    }

    def __init__(self, config_path="data/quotas.json"):
        self.config_path = config_path
        self.quotas = self._load_quotas()
        self._validate_defaults()

    def _load_quotas(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    data = json.load(f)
                    # Merge with defaults to ensure all keys exist
                    for role, d_vals in self.DEFAULTS.items():
                        if role in data:
                            for k, v in d_vals.items():
                                data[role].setdefault(k, v)
                        else:
                            data[role] = d_vals
                    return data
            except:
                pass
        return self.DEFAULTS

    def _validate_defaults(self):
        """Ensure all roles in quotas have the basic expected keys."""
        for role in ["admin", "user", "guest"]:
            if role not in self.quotas:
                self.quotas[role] = self.DEFAULTS[role]
            else:
                for k, v in self.DEFAULTS[role].items():
                    if k not in self.quotas[role]:
                        self.quotas[role][k] = v

    def get_quota(self, role: str) -> Dict[str, Any]:
        return self.quotas.get(role, self.quotas["guest"])

    def _save_quotas(self):
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(self.quotas, f, indent=4)

    def check_resource_availability(self, user_role: str, current_usage: Dict, requested: Dict) -> Dict:
        """
        Vérifie si la création / modification d'une ressource respecte les quotas.
        :param current_usage: {'servers': int, 'memory_mb': int, 'cpu_cores': float}
        :param requested: {'count': int, 'memory': str, 'cpu': float}
        :return: {'allowed': bool, 'reason': str}
        """
        quota = self.get_quota(user_role)
        req_count = requested.get('count', 1)
        
        # 1. Check Server Count
        if current_usage.get('servers', 0) + req_count > quota['max_servers']:
            return {"allowed": False, "reason": f"Quota exceeded: Max {quota['max_servers']} servers allowed."}

        # 2. Check Memory
        new_mem_req = parse_size_to_mb(requested.get('memory', '2G')) * req_count
        used_mem = current_usage.get('memory_mb', 0)
        
        if used_mem + new_mem_req > quota['max_memory_mb']:
            return {"allowed": False, "reason": f"Quota exceeded: Not enough RAM (Max {quota['max_memory_mb']}MB)."}
            
        # 3. Check CPU
        new_cpu_req = float(requested.get('cpu', 1.0)) * req_count
        used_cpu = current_usage.get('cpu_cores', 0.0)

        if used_cpu + new_cpu_req > quota['max_cpu_cores']:
            return {"allowed": False, "reason": f"Quota exceeded: Not enough CPU (Max {quota['max_cpu_cores']} cores)."}

        return {"allowed": True}

    def get_current_usage(self, username: str, server_manager) -> Dict[str, Any]:
        """Calcul de l'utilisation actuelle des ressources par un utilisateur"""
        servers = server_manager.list_servers(owner=username)
        total_mem = 0
        total_cpu = 0
        
        for srv_name in servers:
            config = server_manager.get_server_config(srv_name)
            total_mem += parse_size_to_mb(config.get("ram_max", "2048M"))
            # Par défaut, on considère 1 vCPU par serveur si non spécifié
            total_cpu += float(config.get("cpu_limit", 1.0) or 1.0)
            
        return {
            "servers": len(servers),
            "memory_mb": total_mem,
            "cpu_cores": total_cpu
        }
