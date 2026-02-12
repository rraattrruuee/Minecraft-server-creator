import yaml
import os
from typing import Dict, Any

class SwarmServiceGenerator:
    """
    Génère des configurations Docker Compose pour le déploiement sur Swarm
    avec support des Secrets et de l'isolation réseau.
    """
    
    def __init__(self, secrets_prefix="mc_secret_"):
        self.secrets_prefix = secrets_prefix

    def generate_stack_config(self, server_name: str, config: Dict[str, Any], secrets: Dict[str, str], network_name="si-network") -> str:
        """
        Génère le contenu YAML pour une stack Docker Swarm.
        
        :param server_name: Nom du serveur (service)
        :param config: Configuration du serveur (image, port, env vars...)
        :param secrets: Dictionnaire des secrets à créer/utiliser {key: value}
        :param network_name: Nom du réseau isolé (permet le multi-tenant)
        """
        
        # 1. Définition des secrets
        secrets_config = {}
        service_secrets = []
        
        for key, value in secrets.items():
            secret_name = f"{self.secrets_prefix}{server_name}_{key}"
            secrets_config[secret_name] = {
                "external": True # On suppose qu'ils sont créés via SwarmDeployer.create_secret
            }
            service_secrets.append({
                "source": secret_name,
                "target": key 
            })

        # 2. Définition du service
        service_def = {
            "image": config.get("image", "itzg/minecraft-server"),
            "environment": {
                "EULA": "TRUE",
                "TYPE": config.get("type", "PAPER"),
                "VERSION": config.get("version", "latest"),
                "MEMORY": config.get("memory", "2G"),
                # Utilisation des secrets via des fichiers montés ou env vars specifiques aux images supportant les secrets
                # L'image itzg/minecraft-server supporte les fichiers secrets pour certaines vars
                # Sinon on peut utiliser un entrypoint custom.
                "RCON_PASSWORD_FILE": f"/run/secrets/rcon_password" if "rcon_password" in secrets else None
            },
            "ports": [
                f"{config.get('port', 25565)}:25565"
            ],
            "networks": [network_name],
            "deploy": {
                "replicas": 1,
                "restart_policy": {
                    "condition": "on-failure"
                },
                "resources": {
                    "limits": {
                        "memory": config.get("memory", "2500M")
                    }
                },
                "labels": {
                     "type": "minecraft-server",
                     "server_name": server_name,
                     "network": network_name
                }
            },
            "volumes": [
                 f"minecraft_data_{server_name}:/data"
            ]
        }
        
        # Clean None values
        service_def["environment"] = {k: v for k, v in service_def["environment"].items() if v is not None}
        if service_secrets:
            service_def["secrets"] = service_secrets

        # 3. Assemblage final
        compose = {
            "version": "3.8",
            "services": {
                server_name: service_def
            },
            "networks": {
                network_name: {
                    "external": True
                }
            },
            "volumes": {
                f"minecraft_data_{server_name}": {}
            }
        }
        
        if secrets_config:
            compose["secrets"] = secrets_config
            
        return yaml.dump(compose, sort_keys=False)
