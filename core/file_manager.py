import os
import shutil
import time
import logging
from datetime import datetime
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)

class FileManager:
    def __init__(self, base_dir="servers"):
        self.base_dir = os.path.abspath(base_dir)

    def _get_secure_path(self, server_name, rel_path):
        """
        Resolves the absolute path and ensures it's within the server's directory.
        :param server_name: Name of the server
        :param rel_path: Relative path requested (e.g. "world/level.dat")
        :return: Absolute path if safe, raises Exception otherwise
        """
        if not server_name or ".." in server_name or "/" in server_name:
            raise ValueError("Invalid server name")
            
        # Modif: Le root pour l'utilisateur est maintenant le dossier "data" uniquement.
        server_root = os.path.join(self.base_dir, server_name, "data")
        
        # Si le dossier data n'existe pas, pointer sur le root (cas legacy ou erreur)
        if not os.path.exists(server_root):
             parent_root = os.path.join(self.base_dir, server_name)
             if os.path.exists(parent_root):
                 # Créer le dossier data s'il manque
                 os.makedirs(server_root, exist_ok=True)
             else:
                 raise FileNotFoundError("Server not found")
        
        if rel_path.startswith("/"):
            rel_path = rel_path[1:]
        
        target_path = os.path.abspath(os.path.join(server_root, rel_path))
        
        if not target_path.startswith(server_root):
            raise ValueError("Path traversal attempt detected")
            
        return target_path

    def list_files(self, server_name, path=""):
        try:
            full_path = self._get_secure_path(server_name, path)
            
            if not os.path.exists(full_path):
                return []
            
            if not os.path.isdir(full_path):
                return []

            items = []
            for entry in os.scandir(full_path):
                stat = entry.stat()
                items.append({
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "size": stat.st_size if not entry.is_dir() else 0,
                    "mtime": stat.st_mtime,
                    "mtime_str": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                })
            
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            return items
        except FileNotFoundError as e:
            # common when server directory missing; log at debug level
            logger.debug(f"[FileManager] List skipped missing server: {e}")
            return []
        except Exception as e:
            logger.error(f"[FileManager] List Error: {e}")
            return []

    def _check_sensitive_block(self, full_path):
        """Bloque l'accès aux fichiers critiques"""
        filename = os.path.basename(full_path)
        if filename in ["docker-compose.yml", "manager_config.json", ".env", "passwd", "shadow"]:
            raise PermissionError("Accès interdit à ce fichier critique.")

    def read_file(self, server_name, path):
        try:
            full_path = self._get_secure_path(server_name, path)
            self._check_sensitive_block(full_path)
            
            if not os.path.isfile(full_path):
                raise FileNotFoundError("File not found")
            
            if os.path.getsize(full_path) > 5 * 1024 * 1024:
                raise ValueError("File too large to edit (max 5MB)")

            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception as e:
            raise e

    def save_file(self, server_name, path, content):
        try:
            full_path = self._get_secure_path(server_name, path)
            self._check_sensitive_block(full_path)
            
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)
            return True
        except Exception as e:
            raise e

    def create_directory(self, server_name, path, dir_name):
        try:
            parent_path = self._get_secure_path(server_name, path)
            new_dir_path = os.path.join(parent_path, secure_filename(dir_name))
            
            if not new_dir_path.startswith(self.base_dir):
                 raise ValueError("Invalid path")

            os.makedirs(new_dir_path, exist_ok=True)
            return True
        except Exception as e:
            raise e

    def delete_item(self, server_name, path):
        try:
            full_path = self._get_secure_path(server_name, path)
            self._check_sensitive_block(full_path)
            
            if os.path.isdir(full_path):
                shutil.rmtree(full_path)
            else:
                os.remove(full_path)
            return True
        except Exception as e:
            raise e

    def rename_item(self, server_name, path, new_name):
        try:
            old_path = self._get_secure_path(server_name, path)
            self._check_sensitive_block(old_path)

            parent_dir = os.path.dirname(old_path)
            new_name = secure_filename(new_name)
            new_path = os.path.join(parent_dir, new_name)
            self._check_sensitive_block(new_path)
            
            if not os.path.abspath(new_path).startswith(os.path.join(self.base_dir, server_name)):
                raise ValueError("Destination out of bounds")

            os.rename(old_path, new_path)
            return True
        except Exception as e:
            raise e

    def _validate_file_content(self, file_storage):
        """Vérifie le contenu réel du fichier (Magic Bytes)"""
        filename = file_storage.filename.lower()
        
        # Read first 16 bytes
        header = file_storage.read(2048) # Read a chunk to be safe
        file_storage.seek(0) # Reset pointer
        
        # 1. Block executable scripts
        if filename.endswith(".sh") or filename.endswith(".bash"):
            raise ValueError("Les scripts shell (.sh) sont interdits.")
        if filename.endswith(".py"):
             raise ValueError("Les scripts Python sont interdits.")
        
        # 2. Verify JAR files (must be ZIP)
        if filename.endswith(".jar"):
            if not header.startswith(b'PK\x03\x04'):
                 raise ValueError("Fichier .jar invalide (pas un zip)")
                 
        # 3. Verify Images (simple check)
        if filename.endswith(".png"):
            if not header.startswith(b'\x89PNG\r\n\x1a\n'):
                 raise ValueError("Fichier .png invalide")
                 
        # 4. Block potentially dangerous extensions
        # .html, .js, .svg can be used for XSS/Phishing if the panel serves them directly
        forbidden = [".exe", ".bat", ".cmd", ".msi", ".vbs", ".php", ".pl", ".html", ".htm", ".js", ".svg"]
        if any(filename.endswith(ext) for ext in forbidden):
            raise ValueError(f"Extension interdite (risque de sécurité): {os.path.splitext(filename)[1]}")
            
        return True

    def handle_upload(self, server_name, path, files, max_size_mb=100):
        """
        Handles list of FileStorage objects from Flask
        """
        try:
            target_dir = self._get_secure_path(server_name, path)
            if not os.path.isdir(target_dir):
                raise NotADirectoryError("Target is not a directory")

            max_bytes = max_size_mb * 1024 * 1024
            results = []
            for file in files:
                if file and file.filename:
                    # 1. Check size (approximately via stream if available, but Flask already has MAX_CONTENT_LENGTH)
                    # However we can be explicit here too.
                    file.seek(0, os.SEEK_END)
                    size = file.tell()
                    file.seek(0)
                    
                    if size > max_bytes:
                        raise ValueError(f"Fichier {file.filename} trop volumineux (max {max_size_mb}MB)")

                    # 2. Validate content BEFORE saving
                    self._validate_file_content(file)
                    
                    filename = secure_filename(file.filename)
                    save_path = os.path.join(target_dir, filename)
                    file.save(save_path)
                    logger.info(f"Fichier uploadé avec succès: {filename} pour {server_name}")
                    results.append(filename)
            return results
        except Exception as e:
            logger.error(f"Erreur upload pour {server_name}: {e}")
            raise e

    def get_download_path(self, server_name, path):
        return self._get_secure_path(server_name, path)
