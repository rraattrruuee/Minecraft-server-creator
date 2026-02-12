import time
from typing import Dict, Any

class BillingManager:
    """
    Gère l'estimation des coûts d'infrastructure.
    """
    
    # Prix par défaut (en € par heure)
    PRICING = {
        "cpu_core": 0.02,    # Prix par coeur CPU
        "ram_gb": 0.01,      # Prix par Go de RAM
        "storage_gb": 0.0005 # Prix par Go de stockage
    }

    def __init__(self, server_manager):
        self.srv_mgr = server_manager

    def estimate_server_cost(self, server_config: Dict[str, Any]) -> float:
        """Estime le coût mensuel (730 heures) d'un serveur"""
        
        # Ram
        ram_str = str(server_config.get("ram_max", "2048M"))
        ram_gb = self._parse_ram_to_gb(ram_str)
        
        # CPU (Simulé, car souvent pas défini strictement)
        cpu_cores = 1 if ram_gb < 4 else 2
        if ram_gb > 8: cpu_cores = 4
        
        # Storage (Base 10GB + world size estimé)
        storage_gb = 10 
        
        hourly_cost = (
            (ram_gb * self.PRICING["ram_gb"]) +
            (cpu_cores * self.PRICING["cpu_core"]) +
            (storage_gb * self.PRICING["storage_gb"])
        )
        
        return {
            "hourly": round(hourly_cost, 4),
            "monthly": round(hourly_cost * 730, 2),
            "currency": "EUR"
        }

    def _parse_ram_to_gb(self, ram_str: str) -> float:
        ram_str = ram_str.upper()
        if ram_str.endswith("G") or ram_str.endswith("GB"):
            return float(ram_str.replace("GB", "").replace("G", ""))
        if ram_str.endswith("M") or ram_str.endswith("MB"):
            return float(ram_str.replace("MB", "").replace("M", "")) / 1024.0
        return 2.0
