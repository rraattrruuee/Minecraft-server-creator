# Add HA logic and Security
from dataclasses import dataclass
import time
import requests
import logging

logger = logging.getLogger(__name__)

@dataclass
class ServiceMonitor:
    name: str
    port: int
    replicas: int

class HighAvailabilityManager:
    def __init__(self, swarm_deployer):
        self.deployer = swarm_deployer
        self.services_to_watch = []
        self.running = False
        
    def check_service_health(self, service_name: str) -> bool:
        """Vérifie si un service est en bonne santé via Docker Swarm"""
        # Checks if at least one task is running
        code, out, err = self.deployer.execute_command(
            f"docker service ps {service_name} --filter 'desired-state=running' --format '{{{{.CurrentState}}}}'"
        )
        if code != 0:
            logger.error(f"[HA] Error checking service {service_name}: {err}")
            return False
            
        # Check if "Running" appears in the output tasks
        return "Running" in out

    def auto_heal(self, service_name: str):
        """Redéploie un service tombé"""
        logger.warning(f"[HA] Service {service_name} détecté HS. Tentative de redémarrage automatique...")
        # Force update to restart tasks
        self.deployer.execute_command(f"docker service update --force {service_name}")
        
    def watch_service(self, service_name):
        if service_name not in self.services_to_watch:
            self.services_to_watch.append(service_name)
            logger.info(f"[HA] Added {service_name} to watch list")

    def monitor_loop(self):
        """Boucle de surveillance (à lancer dans un thread)"""
        logger.info("[HA] Starting Monitoring Loop")
        self.running = True
        while self.running:
            # En production, on récupérerait la liste dynamique de tous les services Minecraft
            # Pour l'instant, on itère sur ceux enregistrés
            if not self.services_to_watch:
                 # Auto-discovery of services with label minecraft-server=true
                 code, out, err = self.deployer.execute_command(
                     "docker service ls --filter label=type=minecraft-server --format '{{.Name}}'"
                 )
                 if code == 0 and out.strip():
                     self.services_to_watch = out.strip().split('\n')

            for s in self.services_to_watch:
                if s and not self.check_service_health(s):
                   self.auto_heal(s)
            
            time.sleep(60)

    def stop(self):
        self.running = False
