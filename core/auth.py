import json
import os
import secrets
from datetime import datetime, timedelta
from functools import wraps

from flask import redirect, request, session, url_for, jsonify
from werkzeug.security import check_password_hash
from argon2 import PasswordHasher
import pyotp
from sqlalchemy.exc import IntegrityError
from .db import get_session, init_db, User, AuditLog

# Use Argon2 for new hashes
ph = PasswordHasher()

LEGACY_SALT_FILE = ".hash_salt"

class AuthManager:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        self.users_file = os.path.join(data_dir, "users.json")
        self.audit_file = os.path.join(data_dir, "audit.log")
        self.legacy_salt = self._load_or_create_legacy_salt()
        
        # Rate Limiting
        self.login_attempts = {} 
        self.failed_logins = {} 
        
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
        # Initialize DB and create a default admin if no users exist
        init_db()
        session = get_session()
        try:
            count = session.query(User).count()
            if count == 0:
                # create admin user with default password 'admin' (developer mode)
                admin = User(username='admin', password_hash=ph.hash('admin'), role='admin')
                session.add(admin)
                session.commit()
                print('[AUTH] Default admin created (pwd: admin)')
        except Exception as e:
            print('[AUTH] Error initializing DB users:', e)
            session.rollback()
        finally:
            session.close()

    def _load_or_create_legacy_salt(self):
        """Load an installation-specific legacy salt from disk or create it.

        The file is stored inside the data directory and is ignored by git via .gitignore.
        """
        path = os.path.join(self.data_dir, LEGACY_SALT_FILE)
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return f.read().strip()
            salt = secrets.token_hex(32)
            tmp = f"{path}.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(salt)
            os.replace(tmp, path)
            try:
                os.chmod(path, 0o600)
            except Exception:
                pass
            return salt
        except Exception:
            return secrets.token_hex(32)

    def _is_user_locked(self, username):
        """Return True if username is currently locked by DB locked_until."""
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return False
            if getattr(user, 'locked_until', None):
                if datetime.now() < user.locked_until:
                    return True
                # If lock expired, clear it (best-effort)
                user.locked_until = None
                user.failed_attempts = 0
                session.add(user)
                session.commit()
            return False
        finally:
            session.close()

    def _get_lock_until(self, username):
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return None
            return getattr(user, 'locked_until', None)
        finally:
            session.close()

    def _record_failed_login(self, username):
        """Record a failed login in DB and apply exponential backoff lockout if threshold reached."""
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            now_dt = datetime.now()
            if not user:
                # no DB user, track in memory as before
                now = now_dt.timestamp()
                if username not in self.failed_logins:
                    self.failed_logins[username] = []
                self.failed_logins[username].append(now)
                return

            # increment counters
            user.failed_attempts = (user.failed_attempts or 0) + 1
            user.last_failed_at = now_dt

            # Threshold and backoff policy
            threshold = 5
            base_lock = 15 * 60  # 15 minutes
            if user.failed_attempts >= threshold:
                # exponential growth based on attempts over threshold
                multiplier = 2 ** max(0, user.failed_attempts - threshold)
                lock_seconds = base_lock * multiplier
                user.locked_until = now_dt + timedelta(seconds=lock_seconds)

            session.add(user)
            session.commit()
        finally:
            session.close()

    def _clear_failed_logins(self, username):
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if user:
                user.failed_attempts = 0
                user.locked_until = None
                user.last_failed_at = None
                session.add(user)
                session.commit()
        finally:
            session.close()

    def _load_users(self):
        # Deprecated: loading users from file. Use DB instead.
        # Keep fallback for compatibility
        try:
            with open(self.users_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    
    # Note: file-based user persistence is deprecated in favor of DB-backed users.
    # The legacy file helpers have been removed; if fallback is needed, use
    # `_load_users()` to read the file and migrate into the DB via the provided
    # migration scripts.
    
    def authenticate(self, username, password, client_ip="0.0.0.0", otp=None):
        # Rate Limiting Check
        if not self._check_rate_limit(client_ip):
            self._log_audit(username, "LOGIN_BLOCKED", f"Rate limit exceeded IP: {client_ip}")
            return None, "Trop de tentatives. Réessayez dans 15 minutes."

        lock_until = self._get_lock_until(username)
        if lock_until and datetime.now() < lock_until:
            remaining = int((lock_until - datetime.now()).total_seconds())
            mins = max(1, remaining // 60)
            self._log_audit(username, "LOGIN_BLOCKED", "Account locked due to repeated failures")
            return None, f"Compte verrouillé temporairement, réessayez dans {mins} minutes."

        # Prefer DB-backed users
        session = get_session()
        try:
            db_user = session.query(User).filter(User.username == username).first()
            if db_user:
                stored_hash = getattr(db_user, 'password_hash', '') or ''
                verified = False

                # Argon2 format starts with $argon2
                if stored_hash.startswith('$argon2'):
                    try:
                        ph.verify(stored_hash, password)
                        verified = True
                    except Exception:
                        verified = False
                elif stored_hash.startswith('scrypt:') or stored_hash.startswith('pbkdf2:'):
                    # older werkzeug hashes
                    if check_password_hash(stored_hash, password):
                        verified = True
                else:
                    # legacy sha256 salted
                    if self._check_legacy_hash(password, stored_hash):
                        verified = True

                if not verified:
                    self._log_audit(username, "LOGIN_FAILED", "bad password")
                    self._record_failed_login(username)
                    return None, "Identifiants invalides."

                # If user has 2FA enabled, require OTP
                if getattr(db_user, 'totp_enabled', False):
                    if not otp:
                        return None, "2FA_REQUIRED"
                    try:
                        totp = pyotp.TOTP(db_user.totp_secret)
                        if not totp.verify(otp, valid_window=1):
                            self._log_audit(username, "LOGIN_FAILED", "bad 2fa code")
                            self._record_failed_login(username)
                            return None, "Code 2FA invalide"
                    except Exception:
                        return None, "Code 2FA invalide"
                # If user has 2FA enabled, require OTP
                if getattr(db_user, 'totp_enabled', False):
                    if not otp:
                        return None, "2FA_REQUIRED"
                    try:
                        totp = pyotp.TOTP(db_user.totp_secret)
                        if not totp.verify(otp, valid_window=1):
                            self._log_audit(username, "LOGIN_FAILED", "bad 2fa code")
                            self._record_failed_login(username)
                            return None, "Code 2FA invalide"
                    except Exception:
                        return None, "Code 2FA invalide"

                # On successful login, if hash is legacy/non-argon2, migrate to Argon2
                if not stored_hash.startswith('$argon2'):
                    try:
                        db_user.password_hash = ph.hash(password)
                        db_user.needs_password_reset = False
                        session.add(db_user)
                        session.commit()
                    except Exception:
                        session.rollback()
                        # best-effort: flag user as needing reset so admin can act
                        try:
                            db_user.needs_password_reset = True
                            session.add(db_user)
                            session.commit()
                        except Exception:
                            try:
                                session.rollback()
                            except Exception:
                                pass

                # success
                db_user.last_login = datetime.now()
                session.add(db_user)
                session.commit()
                self._clear_failed_logins(username)
                self._log_audit(username, "LOGIN_SUCCESS", "")
                return {
                    "username": db_user.username,
                    "role": db_user.role,
                    "email": db_user.email or "",
                    "discord_webhook": db_user.discord_webhook or ""
                }, None

            # Fallback to file-based users for migration support
            users = self._load_users()
            if username not in users:
                check_password_hash('pbkdf2:sha256:1000$dummy$dummy', 'dummy')
                self._record_failed_login(username)
                return None, "Identifiants invalides."

            user = users[username]
            stored_hash = user.get("password_hash", "")
            if stored_hash.startswith("scrypt:") or stored_hash.startswith("pbkdf2:"):
                if not check_password_hash(stored_hash, password):
                    self._log_audit(username, "LOGIN_FAILED", "bad password")
                    self._record_failed_login(username)
                    return None, "Identifiants invalides."
                # migrate into DB
                try:
                    new_hash = ph.hash(password)
                    new_user = User(username=username, password_hash=new_hash, role=user.get('role','user'), email=user.get('email',''))
                    new_user.needs_password_reset = False
                    session.add(new_user)
                    session.commit()
                except Exception:
                    session.rollback()
            else:
                if self._check_legacy_hash(password, stored_hash):
                    # migrate
                    try:
                        new_hash = ph.hash(password)
                        new_user = User(username=username, password_hash=new_hash, role=user.get('role','user'), email=user.get('email',''))
                        session.add(new_user)
                        session.commit()
                    except Exception:
                        session.rollback()
                else:
                    self._log_audit(username, "LOGIN_FAILED", "bad password (legacy)")
                    self._record_failed_login(username)
                    return None, "Identifiants invalides."

            # If migrated, return user data
            migrated = session.query(User).filter(User.username == username).first()
            if migrated:
                migrated.last_login = datetime.now()
                migrated.needs_password_reset = False
                # ensure 2FA is not inadvertently set for migrated users
                migrated.totp_enabled = False
                migrated.totp_secret = None
                session.add(migrated)
                session.commit()
                self._clear_failed_logins(username)
                self._log_audit(username, "LOGIN_SUCCESS_MIGRATED", "")
                return {
                    "username": migrated.username,
                    "role": migrated.role,
                    "email": migrated.email or "",
                    "discord_webhook": migrated.discord_webhook or ""
                }, None
            return None, "Identifiants invalides."
        finally:
            session.close()
    
    def create_user(self, username, password, role="user", email=""):
        # Check password strength
        valid, msg = self._check_password_strength(password)
        if not valid:
            return False, msg

        session = get_session()
        try:
            exists = session.query(User).filter(User.username == username).first()
            if exists:
                return False, "Cet utilisateur existe déjà"
            pwd_hash = ph.hash(password)
            user = User(username=username, password_hash=pwd_hash, role=role, email=email)
            user.totp_enabled = False
            user.totp_secret = None
            session.add(user)
            session.commit()
            self._log_audit(username, "USER_CREATED", role)
            return True, "OK"
        except IntegrityError:
            session.rollback()
            return False, "Cet utilisateur existe déjà"
        finally:
            session.close()
    
    def update_user(self, username, data):
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return False, "Not found"
            if "password" in data and data["password"]:
                user.password_hash = ph.hash(data["password"])
                user.needs_password_reset = False
            if "role" in data:
                user.role = data["role"]
            if "email" in data:
                user.email = data["email"]
            if "discord_webhook" in data:
                user.discord_webhook = data["discord_webhook"]
            session.add(user)
            session.commit()
            self._log_audit(username, "USER_UPDATED", str(list(data.keys())))
            return True, "OK"
        finally:
            session.close()
    
    def delete_user(self, username):
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return False, "Not found"
            if username == "admin":
                return False, "Cannot delete admin"
            session.delete(user)
            session.commit()
            self._log_audit(username, "USER_DELETED", "")
            return True, "OK"
        finally:
            session.close()
    
    def list_users(self):
        session = get_session()
        try:
            rows = session.query(User).all()
            return [
                {
                    "username": r.username,
                    "role": r.role,
                    "email": r.email or "",
                    "created_at": getattr(r, 'created_at', None),
                    "last_login": getattr(r, 'last_login', None),
                    "default_password_changed": getattr(r, 'default_password_changed', False)
                    ,"needs_password_reset": getattr(r, 'needs_password_reset', False)
                }
                for r in rows
            ]
        finally:
            session.close()
    
    def change_password(self, username, old_password, new_password):
        # Validate strength
        valid, msg = self._check_password_strength(new_password)
        if not valid:
            return False, msg
        # Prefer DB-backed user
        session = get_session()
        try:
            db_user = session.query(User).filter(User.username == username).first()
            if db_user:
                stored_hash = getattr(db_user, 'password_hash', '') or ''

                verified = False
                # Argon2
                if stored_hash.startswith('$argon2'):
                    try:
                        ph.verify(stored_hash, old_password)
                        verified = True
                    except Exception:
                        verified = False
                elif stored_hash.startswith('scrypt:') or stored_hash.startswith('pbkdf2:'):
                    if check_password_hash(stored_hash, old_password):
                        verified = True
                else:
                    if self._check_legacy_hash(old_password, stored_hash):
                        verified = True

                if not verified:
                    return False, "Ancien mot de passe incorrect"

                # Update password to Argon2
                db_user.password_hash = ph.hash(new_password)
                # mark default password changed for admin
                if db_user.username == 'admin':
                    db_user.default_password_changed = True
                session.add(db_user)
                session.commit()
                self._log_audit(username, "PASSWORD_CHANGED", "")
                return True, "Mot de passe modifié"

            # Fallback to file-based users for compatibility
            users = self._load_users()
            if username not in users:
                return False, "Utilisateur introuvable"

            user = users[username]
            stored_hash = user.get("password_hash", "")
            # verify (werkzeug or legacy)
            ok = False
            if stored_hash.startswith('scrypt:') or stored_hash.startswith('pbkdf2:'):
                ok = check_password_hash(stored_hash, old_password)
            else:
                ok = self._check_legacy_hash(old_password, stored_hash)

            if not ok:
                return False, "Ancien mot de passe incorrect"

            # migrate: create DB entry with Argon2 hash
            try:
                new_hash = ph.hash(new_password)
                new_user = User(username=username, password_hash=new_hash, role=user.get('role','user'), email=user.get('email',''))
                if username == 'admin':
                    new_user.default_password_changed = True
                new_user.totp_enabled = False
                new_user.totp_secret = None
                session.add(new_user)
                session.commit()
                self._log_audit(username, "PASSWORD_CHANGED", "(migrated from file)")
                return True, "Mot de passe modifié"
            except Exception:
                session.rollback()
                return False, "Erreur lors de la modification du mot de passe"
        finally:
            session.close()
    
    def _log_audit(self, username, action, details):
        # Write to audit file and DB (best-effort)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ip = "-"
        try:
            if request:
                ip = request.remote_addr
        except Exception:
            pass

        try:
            with open(self.audit_file, "a", encoding="utf-8") as f:
                f.write(f"[{ts}] [{ip}] [{username}] {action}: {details}\n")
        except Exception:
            pass

        # Insert into DB audit table
        try:
            session = get_session()
            log = AuditLog(username=username, action=action, details=details)
            session.add(log)
            session.commit()
        except Exception:
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            try:
                session.close()
            except Exception:
                pass
    
    def get_audit_logs(self, limit=100):
        # Prefer DB-backed audit logs (most recent first)
        try:
            session = get_session()
            rows = session.query(AuditLog).order_by(AuditLog.ts.desc()).limit(limit).all()
            results = [f"[{r.ts.strftime('%Y-%m-%d %H:%M:%S')}] [{r.username}] {r.action}: {r.details}" for r in rows]
            if results:
                return results
        except Exception:
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            try:
                session.close()
            except Exception:
                pass

        # Fallback to file-based audit log
        try:
            if not os.path.exists(self.audit_file):
                return []
            with open(self.audit_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                return lines[-limit:][::-1]
        except:
            return []

    # --- TOTP / 2FA helpers ---
    def generate_2fa_secret(self, username):
        """Return a new base32 secret and provisioning URI for the user (not yet enabled)."""
        secret = pyotp.random_base32()
        uri = pyotp.totp.TOTP(secret).provisioning_uri(name=username, issuer_name="MCPanel")
        return secret, uri

    def enable_2fa(self, username, secret, code):
        """Enable 2FA for the user after verifying the code against the secret."""
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return False, "Utilisateur introuvable"
            try:
                totp = pyotp.TOTP(secret)
                if not totp.verify(code, valid_window=1):
                    return False, "Code 2FA invalide"
            except Exception:
                return False, "Code 2FA invalide"
            user.totp_secret = secret
            user.totp_enabled = True
            session.add(user)
            session.commit()
            self._log_audit(username, "2FA_ENABLED", "")
            return True, "2FA activée"
        finally:
            session.close()

    def disable_2fa(self, username, password, code):
        """Disable 2FA after verifying password and code."""
        # verify password without triggering login flows
        if not self._verify_password(username, password):
            return False, "Mot de passe incorrect"
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user or not user.totp_enabled:
                return False, "2FA non activée"
            try:
                totp = pyotp.TOTP(user.totp_secret)
                if not totp.verify(code, valid_window=1):
                    return False, "Code 2FA invalide"
            except Exception:
                return False, "Code 2FA invalide"
            user.totp_secret = None
            user.totp_enabled = False
            session.add(user)
            session.commit()
            self._log_audit(username, "2FA_DISABLED", "")
            return True, "2FA désactivée"
        finally:
            session.close()

    def _verify_password(self, username, password):
        """Helper to verify a password for a username without other side-effects."""
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return False
            stored_hash = getattr(user, 'password_hash', '') or ''
            if stored_hash.startswith('$argon2'):
                try:
                    ph.verify(stored_hash, password)
                    return True
                except Exception:
                    return False
            if stored_hash.startswith('scrypt:') or stored_hash.startswith('pbkdf2:'):
                return check_password_hash(stored_hash, password)
            return self._check_legacy_hash(password, stored_hash)
        finally:
            session.close()

    # --- Password reset flow ---
    def request_password_reset(self, username_or_email):
        session = get_session()
        try:
            user = session.query(User).filter((User.username == username_or_email) | (User.email == username_or_email)).first()
            if not user:
                # don't reveal whether user exists
                return True, "If that account exists, a reset token was issued"
            token = secrets.token_urlsafe(32)
            user.reset_token = token
            user.reset_expires = datetime.now() + timedelta(hours=1)
            session.add(user)
            session.commit()
            self._log_audit(user.username, "PASSWORD_RESET_REQUESTED", token)
            # in production you'd email the token; for now return it for tests/dev
            return True, token
        finally:
            session.close()

    def reset_password(self, username, token, new_password):
        valid, msg = self._check_password_strength(new_password)
        if not valid:
            return False, msg
        session = get_session()
        try:
            user = session.query(User).filter(User.username == username).first()
            if not user:
                return False, "Utilisateur introuvable"
            if not user.reset_token or user.reset_token != token:
                return False, "Token invalide"
            if not user.reset_expires or datetime.now() > user.reset_expires:
                return False, "Token expiré"
            user.password_hash = ph.hash(new_password)
            user.reset_token = None
            user.reset_expires = None
            user.needs_password_reset = False
            session.add(user)
            session.commit()
            self._log_audit(username, "PASSWORD_RESET", "")
            return True, "Mot de passe réinitialisé"
        finally:
            session.close()


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
    # kept for backward-compatibility; implemented via role_required
    return role_required('admin')(f)


def role_required(roles):
    """Decorator to require a role or list of roles.

    Usage:
        @role_required('admin')
        or
        @role_required(['admin','manager'])
    """
    if isinstance(roles, str):
        allowed = {roles}
    else:
        allowed = set(roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if "user" not in session:
                if request.is_json or request.path.startswith("/api/"):
                    return jsonify({"status": "error", "message": "Not authenticated"}), 401
                return redirect(url_for("login"))
            role = session.get("user", {}).get("role")
            if role not in allowed:
                if request.is_json or request.path.startswith("/api/"):
                    return jsonify({"status": "error", "message": "Forbidden"}), 403
                return redirect(url_for("index"))
            return fn(*args, **kwargs)
        return wrapper
    return decorator
