import json
import os
import secrets
from datetime import datetime
from functools import wraps
import hashlib

from flask import redirect, request, session, url_for, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

LEGACY_SALT = "x7Kp2mNqR9"

class AuthManager:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        self.users_file = os.path.join(data_dir, "users.json")
        self.audit_file = os.path.join(data_dir, "audit.log")
        
        # Rate Limiting
        self.login_attempts = {} # {ip: [timestamps]}
        
        os.makedirs(data_dir, exist_ok=True)
        self._init_default_users()

    def _check_password_strength(self, password):
        if len(password) < 8:
            return False, "Le mot de passe doit contenir au moins 8 caractères."
        if not any(c.isupper() for c in password):
            return False, "Le mot de passe doit contenir une majuscule."
        if not any(c.isdigit() for c in password):
            return False, "Le mot de passe doit contenir un chiffre."
        return True, "OK"
    
    def _check_rate_limit(self, ip_address):
        now = datetime.now().timestamp()
        if ip_address not in self.login_attempts:
            self.login_attempts[ip_address] = []
        
        # Clean old attempts (older than 15 minutes)
        self.login_attempts[ip_address] = [t for t in self.login_attempts[ip_address] if now - t < 900]
        
        # Limit: 10 attempts per 15 mins
        if len(self.login_attempts[ip_address]) >= 10:
            return False
            
        self.login_attempts[ip_address].append(now)
        return True
    
    def _init_default_users(self):
        if not os.path.exists(self.users_file):
            default_users = {
                "admin": {
                    "password_hash": generate_password_hash("admin"),
                    "role": "admin",
                    "created_at": datetime.now().isoformat(),
                    "last_login": None,
                    "email": "",
                    "discord_webhook": ""
                }
            }
            self._save_users(default_users)
            print("[AUTH] Default admin created (pwd: admin)")
    
    def _check_legacy_hash(self, password, stored_hash):
        """Check if password matches the old SHA256 method"""
        return hashlib.sha256(f"{LEGACY_SALT}{password}".encode()).hexdigest() == stored_hash

    def _load_users(self):
        try:
            with open(self.users_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    
    def _save_users(self, users):
        temp_file = f"{self.users_file}.tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
        os.replace(temp_file, self.users_file)
    
    def authenticate(self, username, password, client_ip="0.0.0.0"):
        # Rate Limiting Check
        if not self._check_rate_limit(client_ip):
            self._log_audit(username, "LOGIN_BLOCKED", f"Rate limit exceeded IP: {client_ip}")
            return None, "Trop de tentatives. Réessayez dans 15 minutes."

        users = self._load_users()
        if username not in users:
            # Fake hash check to prevent timing attacks
            check_password_hash('pbkdf2:sha256:1000$dummy$dummy', 'dummy')
            return None, "Identifiants invalides."
        
        user = users[username]
        stored_hash = user["password_hash"]
        
        if stored_hash.startswith("scrypt:") or stored_hash.startswith("pbkdf2:"):
            if not check_password_hash(stored_hash, password):
                self._log_audit(username, "LOGIN_FAILED", "bad password")
                return None, "Identifiants invalides."
        else:
            if self._check_legacy_hash(password, stored_hash):
                print(f"[AUTH] Migrating user {username} to secure hash")
                users[username]["password_hash"] = generate_password_hash(password)
                self._save_users(users)
            else:
                self._log_audit(username, "LOGIN_FAILED", "bad password (legacy)")
                return None, "Identifiants invalides."
        
        users[username]["last_login"] = datetime.now().isoformat()
        self._save_users(users)
        
        self._log_audit(username, "LOGIN_SUCCESS", "")
        return {
            "username": username,
            "role": user["role"],
            "email": user.get("email", ""),
            "discord_webhook": user.get("discord_webhook", "")
        }, None
    
    def create_user(self, username, password, role="user", email=""):
        # Check password strength
        valid, msg = self._check_password_strength(password)
        if not valid:
            return False, msg

        users = self._load_users()
        if username in users:
            return False, "Cet utilisateur existe déjà"
        
        users[username] = {
            "password_hash": generate_password_hash(password),
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
            users[username]["password_hash"] = generate_password_hash(data["password"])
        if "role" in data:
            users[username]["role"] = data["role"]
        if "email" in data:
            users[username]["email"] = data["email"]
        if "discord_webhook" in data:
            users[username]["discord_webhook"] = data["discord_webhook"]
        
        self._save_users(users)
        self._log_audit(username, "USER_UPDATED", str(list(data.keys())))
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
                "created_at": data.get("created_at"),
                "last_login": data.get("last_login")
            }
            for u, data in users.items()
        ]
    
    def change_password(self, username, old_password, new_password):
        # Validate strength
        valid, msg = self._check_password_strength(new_password)
        if not valid:
            return False, msg

        users = self._load_users()
        if username not in users:
            return False, "Utilisateur introuvable"
        
        user = users[username]
        # Verify old password
        if not check_password_hash(user["password_hash"], old_password):
             # Legacy check
             if not self._check_legacy_hash(old_password, user["password_hash"]):
                 return False, "Ancien mot de passe incorrect"

        users[username]["password_hash"] = generate_password_hash(new_password)
        self._save_users(users)
        self._log_audit(username, "PASSWORD_CHANGED", "")
        return True, "Mot de passe modifié"
    
    def _log_audit(self, username, action, details):
        try:
            with open(self.audit_file, "a", encoding="utf-8") as f:
                ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                ip = "-"
                if request:
                    ip = request.remote_addr
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
        if session.get("user", {}).get("role") != "admin":
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Forbidden"}), 403
            return redirect(url_for("index"))
        return f(*args, **kwargs)
    return wrapper
