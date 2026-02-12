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
                              version: str = "latest") -> Dict[str, Any]:
        """
        Generate a Docker Compose dictionary for Docker Swarm deployment.
        """
        
        # Convert memory string (e.g. 2G) to bytes or keep as is for Docker
        # Docker compose uses '2G'.
        
        service_name = f"mc-{server_name}"
        
        # Define volume strategy
        volumes = []
        volume_config = {}
        
        if self.nfs_server and self.nfs_path:
            # Connect to NFS
            vol_name = f"data-{server_name}"
            volumes.append(f"{vol_name}:/data")
            volume_config[vol_name] = {
                "driver": "local",
                "driver_opts": {
                    "type": "nfs",
                    "o": f"addr={self.nfs_server},rw",
                    "device": f":{self.nfs_path}/{server_name}"
                }
            }
        else:
            # Fallback to local volume (pinned to node?) or let Swarm handle it (data might be lost if container moves)
            # For "super complet", we strongly suggest NFS or similar.
            volumes.append(f"mc-data-{server_name}:/data")

        environment = {
            "EULA": "TRUE",
            "TYPE": server_type.upper(),
            "VERSION": version,
            "MEMORY": memory,
            "ENABLE_PROMETHEUS_EXPORTER": "true", # Only works if plugin is installed or image supports it
            # Optimization flags
            "JVM_DD_OPTS": "java.util.logging.manager=org.apache.logging.log4j.jul.LogManager",  # Log4j fix/optimization
            "USE_AIKAR_FLAGS": "true"
        }
        
        # Deploy config
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
            "version": "3.8",
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
            
        return stack

    def create_stack_file(self, config: Dict[str, Any], output_path: str):
        with open(output_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False)
