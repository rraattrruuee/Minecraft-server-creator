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
        
        # Mappage des secrets aux fichiers d'environnement supportés par itzg/minecraft-server
        # https://github.com/itzg/docker-minecraft-server/blob/master/README.md#using-secrets
        secret_env_map = {
            "rcon_password": "RCON_PASSWORD_FILE",
            "mysql_password": "MYSQL_PASSWORD_FILE",
            "seed": "SEED_FILE",
            "discord_webhook": "DISCORD_WEBHOOK_URL_FILE"
        }
        
        env_vars = {
            "EULA": "TRUE",
            "TYPE": config.get("type", "PAPER").upper(),
            "VERSION": config.get("version", "latest"),
            "MEMORY": config.get("memory", "2G"),
            "TZ": "Europe/Paris"
        }
        
        for key, value in secrets.items():
            secret_name = f"{self.secrets_prefix}{server_name}_{key}"
            secrets_config[secret_name] = {
                "external": True
            }
            service_secrets.append({
                "source": secret_name,
                "target": key 
            })
            
            # Si le secret est connu comme supporté par file, on l'ajoute à l'env
            env_key = secret_env_map.get(key.lower())
            if env_key:
                env_vars[env_key] = f"/run/secrets/{key}"
            else:
                # Sinon on peut l'injecter via un entrypoint ou juste le laisser dispo en file
                pass

        # 2. Définition du service
        service_def = {
            "image": config.get("image", "itzg/minecraft-server"),
            "environment": env_vars,
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
                     "com.mcpanel.type": "minecraft-server",
                     "com.mcpanel.server": server_name,
                     "com.mcpanel.network": network_name
                }
            },
            "volumes": [
                 f"minecraft_data_{server_name}:/data"
            ]
        }
        
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
