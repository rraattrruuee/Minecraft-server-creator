import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta
from functools import wraps

from flask import redirect, request, session, url_for, jsonify

SALT = "x7Kp2mNqR9"


class AuthManager:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        self.users_file = os.path.join(data_dir, "users.json")
        self.sessions_file = os.path.join(data_dir, "sessions.json")
        self.audit_file = os.path.join(data_dir, "audit.log")
        
        os.makedirs(data_dir, exist_ok=True)
        self._init_default_users()
    
    def _init_default_users(self):
        if not os.path.exists(self.users_file):
            default_users = {
                "admin": {
                    "password_hash": self._hash_password("admin"),
                    "role": "admin",
                    "created_at": datetime.now().isoformat(),
                    "last_login": None,
                    "email": "",
                    "discord_webhook": ""
                }
            }
            self._save_users(default_users)
            print("[AUTH] Default admin created (pwd: admin)")
    
    def _hash_password(self, password):
        return hashlib.sha256(f"{SALT}{password}".encode()).hexdigest()
    
    def _load_users(self):
        try:
            with open(self.users_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    
    def _save_users(self, users):
        with open(self.users_file, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
    
    def authenticate(self, username, password):
        users = self._load_users()
        if username not in users:
            return None
        
        user = users[username]
        if user["password_hash"] != self._hash_password(password):
            self._log_audit(username, "LOGIN_FAILED", "bad password")
            return None
        
        users[username]["last_login"] = datetime.now().isoformat()
        self._save_users(users)
        
        self._log_audit(username, "LOGIN_SUCCESS", "")
        return {
            "username": username,
            "role": user["role"],
            "email": user.get("email", ""),
            "discord_webhook": user.get("discord_webhook", "")
        }
    
    def create_user(self, username, password, role="user", email=""):
        users = self._load_users()
        if username in users:
            return False, "User exists"
        
        users[username] = {
            "password_hash": self._hash_password(password),
            "role": role,
            "created_at": datetime.now().isoformat(),
            "last_login": None,
            "email": email,
            "discord_webhook": ""
        }
        self._save_users(users)
        self._log_audit(username, "USER_CREATED", role)
        return True, "OK"
    
    def update_user(self, username, data):
        users = self._load_users()
        if username not in users:
            return False, "Not found"
        
        if "password" in data and data["password"]:
            users[username]["password_hash"] = self._hash_password(data["password"])
        if "role" in data:
            users[username]["role"] = data["role"]
        if "email" in data:
            users[username]["email"] = data["email"]
        if "discord_webhook" in data:
            users[username]["discord_webhook"] = data["discord_webhook"]
        
        self._save_users(users)
        self._log_audit(username, "USER_UPDATED", str(data.keys()))
        return True, "OK"
    
    def delete_user(self, username):
        users = self._load_users()
        if username not in users:
            return False, "Not found"
        if username == "admin":
            return False, "Cannot delete admin"
        
        del users[username]
        self._save_users(users)
        self._log_audit(username, "USER_DELETED", "")
        return True, "OK"
    
    def list_users(self):
        users = self._load_users()
        return [
            {
                "username": u,
                "role": data["role"],
                "email": data.get("email", ""),
                "created_at": data["created_at"],
                "last_login": data["last_login"]
            }
            for u, data in users.items()
        ]
    
    def change_password(self, username, old_password, new_password):
        users = self._load_users()
        if username not in users:
            return False, "Not found"
        
        if users[username]["password_hash"] != self._hash_password(old_password):
            return False, "Wrong password"
        
        users[username]["password_hash"] = self._hash_password(new_password)
        self._save_users(users)
        self._log_audit(username, "PASSWORD_CHANGED", "")
        return True, "OK"
    
    def _log_audit(self, username, action, details):
        try:
            with open(self.audit_file, "a", encoding="utf-8") as f:
                ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                ip = request.remote_addr if request else "-"
                f.write(f"[{ts}] [{ip}] [{username}] {action}: {details}\n")
        except:
            pass
    
    def get_audit_logs(self, limit=100):
        try:
            if not os.path.exists(self.audit_file):
                return []
            with open(self.audit_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                return lines[-limit:][::-1]
        except:
            return []


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Not authenticated"}), 401
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Not authenticated"}), 401
            return redirect(url_for("login"))
        if session["user"]["role"] != "admin":
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Forbidden"}), 403
            return redirect(url_for("index"))
        return f(*args, **kwargs)
    return wrapper
