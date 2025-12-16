import json
import os

class ConfigEditor:
    def __init__(self, base_dir="servers"):
        self.base_dir = base_dir

    def _get_file_path(self, server_name, filename):
        path = os.path.join(self.base_dir, server_name, filename)
        return path

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
