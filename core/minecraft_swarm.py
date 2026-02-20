import yaml
import os
from typing import Dict, Any

class MinecraftSwarmGenerator:
    def __init__(self, registry_url: str = "127.0.0.1:5000", nfs_server: str = None, nfs_path: str = None):
        self.registry_url = registry_url
        self.nfs_server = nfs_server
        self.nfs_path = nfs_path

    def generate_stack_config(self, 
                              server_name: str, 
                              server_port: int, 
                              memory: str = "2G", 
                              server_type: str = "PAPER", 
                              version: str = "latest",
                              rcon_password: str = None) -> Dict[str, Any]:
        """
        Generate a Docker Compose dictionary for Docker Swarm deployment.
        """
        
        service_name = f"mc-{server_name}"
        
        # Secrets
        service_secrets = []
        secrets_config = {}
        environment = {
            "EULA": "TRUE",
            "TYPE": server_type.upper(),
            "VERSION": version,
            "MEMORY": memory,
            "ENABLE_PROMETHEUS_EXPORTER": "true",
            "USE_AIKAR_FLAGS": "true"
        }

        if rcon_password:
            secret_id = f"mc_secret_{server_name}_rcon"
            service_secrets.append({
                "source": secret_id,
                "target": "rcon_password"
            })
            secrets_config[secret_id] = {"external": True}
            environment["RCON_PASSWORD_FILE"] = "/run/secrets/rcon_password"

        # Define volume strategy
        volumes = []
        volume_config = {}
        
        if self.nfs_server and self.nfs_path:
            # NFS Volume (Shared across swarm nodes)
            vol_name = f"mc_data_{server_name}"
            volumes.append(f"{vol_name}:/data")
            volume_config[vol_name] = {
                "driver": "local",
                "driver_opts": {
                    "type": "nfs",
                    "o": f"addr={self.nfs_server},rw,nfsvers=4,nolock,soft",
                    "device": f":{os.path.join(self.nfs_path, server_name)}"
                }
            }
        else:
            # Local Volume (Bind mount - only works if node is sticky)
            # Warning: Not recommended for multi-node swarm without NFS/Gluster
            volumes.append("./data:/data")
        deploy = {
            "replicas": 1,
            "restart_policy": {
                "condition": "on-failure"
            },
            "resources": {
                "limits": {
                    "memory": str(int(memory[:-1]) * 1.5) + "G" if memory.endswith("G") else memory # Add overhead
                },
                "reservations": {
                    "memory": memory
                }
            }
        }

        # Service definition
        service = {
            "image": "itzg/minecraft-server",
            "ports": [
                f"{server_port}:25565"
            ],
            "environment": environment,
            "volumes": volumes,
            "deploy": deploy,
            "networks": ["minecraft-secure-net"]
        }

        stack = {
            # omit version to avoid compose deprecation warning
            "services": {
                service_name: service
            },
            "networks": {
                "minecraft-secure-net": {
                    "external": True,
                    "name": "minecraft_encrypted_overlay",
                    "driver": "overlay",
                    "driver_opts": {
                        "encrypted": "true" 
                    }
                }
            }
        }
        
        if volume_config:
            stack["volumes"] = volume_config
        
        if secrets_config:
            stack["secrets"] = secrets_config
            
        return stack

    def create_stack_file(self, config: Dict[str, Any], output_path: str):
        with open(output_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False)
