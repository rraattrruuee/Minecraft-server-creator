import json
import os

class ConfigEditor:
    def __init__(self, base_dir="servers"):
        self.base_dir = base_dir

    def _get_file_path(self, server_name, filename):
        server_root = os.path.join(self.base_dir, server_name)
        
        # Détection Docker: les fichiers config sont dans data/
        docker_path = os.path.join(server_root, "data", filename)
        legacy_path = os.path.join(server_root, filename)
        
        # Si c'est un serveur Docker (vérif existence docker-compose.yml), on priorise data/
        if os.path.exists(os.path.join(server_root, "docker-compose.yml")):
            return docker_path
            
        # Sinon logique normale: si le fichier existe dans data/, on le prend, sinon root
        if os.path.exists(docker_path):
            return docker_path
        return legacy_path

    def _read_json(self, path):
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []

    def _save_json(self, path, data):
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return True
        except Exception as e:
            raise e

    def get_whitelist(self, server_name):
        return self._read_json(self._get_file_path(server_name, "whitelist.json"))

    def save_whitelist(self, server_name, data):
        if not isinstance(data, list):
            raise ValueError("Data must be a list")
        return self._save_json(self._get_file_path(server_name, "whitelist.json"), data)

    def get_ops(self, server_name):
        return self._read_json(self._get_file_path(server_name, "ops.json"))

    def save_ops(self, server_name, data):
        if not isinstance(data, list):
            raise ValueError("Data must be a list")
        return self._save_json(self._get_file_path(server_name, "ops.json"), data)

    def get_banned_players(self, server_name):
        return self._read_json(self._get_file_path(server_name, "banned-players.json"))

    def save_banned_players(self, server_name, data):
        if not isinstance(data, list):
            raise ValueError("Data must be a list")
        return self._save_json(self._get_file_path(server_name, "banned-players.json"), data)

    def get_banned_ips(self, server_name):
        return self._read_json(self._get_file_path(server_name, "banned-ips.json"))

    def save_banned_ips(self, server_name, data):
        if not isinstance(data, list):
            raise ValueError("Data must be a list")
        return self._save_json(self._get_file_path(server_name, "banned-ips.json"), data)

    def get_server_properties(self, server_name):
        """Lit le fichier server.properties avec gestion Docker"""
        props_path = self._get_file_path(server_name, "server.properties")
        properties = {}
        if os.path.exists(props_path):
            try:
                with open(props_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            if "=" in line:
                                key, value = line.split("=", 1)
                                properties[key.strip()] = value.strip()
            except:
                pass
        return properties

    def save_server_properties(self, server_name, data):
        """Sauvegarde server.properties"""
        props_path = self._get_file_path(server_name, "server.properties")
        
        # Assurer que le dossier existe
        os.makedirs(os.path.dirname(props_path), exist_ok=True)
        
        lines = ["# Minecraft Server Properties", "# Modified by MCPanel"]
        for k, v in data.items():
            lines.append(f"{k}={v}")
            
        try:
            with open(props_path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            return True
        except:
            return False
