import logging
import os
import secrets
import subprocess
import sys
import threading
import time
import requests
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, jsonify, redirect, render_template, request, session, url_for, Response, send_file, make_response

from core.auth import AuthManager, admin_required, login_required
from core.db import init_db
from core.config_editor import ConfigEditor
from core.file_manager import FileManager
from core.i18n import i18n
from core.manager import ServerManager
from core.monitoring import MetricsCollector, ServerMonitor
from core.notifications import notification_manager, notify
from core.plugins import PluginManager
from core.rcon import RconClient
from core.jobs import get_job_manager
from core.scheduler import BackupScheduler
from core.stats import PlayerStatsManager
from core.tunnel import TunnelManager, get_tunnel_manager
from core.docker_installer import is_docker_installed, install_docker_sync, install_docker_async
from core.rate_limiter import limiter
from core.quota import QuotaManager
from core.governance import GovernanceManager, enforce_governance
from core.marketplace import MarketplaceManager
from core.billing import BillingManager
from core.webhooks import WebhookManager
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from app.swarm_routes import swarm_bp
from app.docker_routes import app_docker

try:
    from PIL import Image
except Exception:
    Image = None

# Configuration encodage pour Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass  # Python < 3.7

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join("data", "mcpanel.log"), encoding='utf-8')
    ]
)
logger = logging.getLogger("MCPanel")

app = Flask(__name__, template_folder="app/templates", static_folder="app/static")
limiter.init_app(app)
quota_mgr = QuotaManager()
market_mgr = MarketplaceManager()
billing_mgr = BillingManager(None) # initialized later
webhook_mgr = WebhookManager()

# Feature: Maintenance Mode
MAINTENANCE_MODE = os.path.exists("data/maintenance.flag")

@app.route('/s/<server_id>')
@login_required
def server_redirect(server_id):
    """Router sécurisé: Redirige l'utilisateur vers son serveur si l'ID correspond"""
    server_name = srv_mgr.find_server_by_id(server_id)
    if not server_name:
        return render_template("404.html"), 404
        
    cfg = srv_mgr.get_server_config(server_name)
    owner = cfg.get("owner")
    current_user = session.get("user", {}).get("username")
    role = session.get("user", {}).get("role")
    
    # Sécurité renforcée: seul le propriétaire ou admin peut accéder
    if role != "admin" and owner != current_user:
        return render_template("403.html", message="Ce serveur ne vous appartient pas."), 403
        
    # Redirection vers le dashboard serveur
    return redirect(url_for('server_dashboard', name=server_name))

@app.route('/metrics')
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

@app.route('/marketplace')
@login_required
def marketplace_ui():
    # redirect into SPA
    return redirect(url_for('index', section='marketplace'))

@app.route('/api/market/search')
@login_required
def api_market_search():
    query = request.args.get('q', '')
    results = market_mgr.search_plugins(query)
    return jsonify({"status": "success", "results": results})

@app.route('/api/market/install', methods=['POST'])
@login_required
def api_market_install():
    data = request.json or {}
    project_id = data.get('project_id')
    server_name = data.get('server_name')
    
    if not project_id or not server_name:
        return jsonify({"status": "error", "message": "project_id and server_name required"}), 400
        
    # Vérifier les droits sur le serveur
    user = session["user"]["username"]
    role = session["user"].get("role")
    
    servers = srv_mgr.list_servers(user if role != "admin" else "admin")
    if server_name not in servers:
        return jsonify({"status": "error", "message": "Accès refusé au serveur"}), 403
        
    server_path = srv_mgr._get_server_path(server_name)
    success, msg = market_mgr.install_plugin(server_path, project_id)
    
    if success:
        auth_mgr._log_audit(user, "MARKET_INSTALL", f"{project_id} -> {server_name}")
        return jsonify({"status": "success", "message": msg})
    else:
        return jsonify({"status": "error", "message": msg}), 500

# Swarm Integration
app.register_blueprint(swarm_bp)

# Docker Dashboard Integration
app.register_blueprint(app_docker)

app.config['JSON_AS_ASCII'] = False

# Persistent Secret Key
secret_file = os.path.join(os.path.dirname(__file__), ".secret_key")
if os.path.exists(secret_file):
    with open(secret_file, "rb") as f:
        app.secret_key = f.read()
else:
    app.secret_key = secrets.token_hex(32).encode()
    with open(secret_file, "wb") as f:
        f.write(app.secret_key)

# Amélioration Sécurité 17: Configuration de session renforcée
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Lax au lieu de Strict pour meilleure compatibilité
app.config['SESSION_COOKIE_SECURE'] = False  # True si HTTPS
app.config['SESSION_COOKIE_NAME'] = 'mcpanel_session'
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 heures
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max

# Amélioration Sécurité 18: Faire expirer les sessions inactives
app.config['SESSION_REFRESH_EACH_REQUEST'] = True

if os.getenv('MCPANEL_FORCE_SECURE', '0') == '1' or os.getenv('FLASK_ENV') == 'production':
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'

log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

# Ensure DB is initialized early
try:
    init_db()
except Exception as e:
    logger.error(f"Critical error initializing Database: {e}")

# ===================== SECURITY MIDDLEWARE =====================
@app.before_request
def maintenance_check():
    """Middleware pour bloquer l'accès en mode maintenance"""
    global MAINTENANCE_MODE
    if MAINTENANCE_MODE:
        # Allow static files and login
        if request.path.startswith("/static") or request.path.startswith("/api/auth") or request.path == "/maintenance":
            return
        
        # Allow admins
        if "user" in session and session["user"].get("role") == "admin":
            return
            
        if request.is_json or request.path.startswith("/api"):
            return jsonify({"status": "error", "message": "Service en maintenance"}), 503
        
        return "<h1>Service en Maintenance</h1><p>Nous revenons bientôt.</p>", 503

@app.before_request
def csrf_protect():
    # Session Revocation Check
    if "user" in session and "login_time" in session:
        if not auth_mgr.is_session_valid(session["user"]["username"], session["login_time"]):
            session.clear()
            return jsonify({"status": "error", "message": "Session révoquée, veuillez vous reconnecter"}), 401

    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        token = session.get("_csrf_token")
        header_token = request.headers.get("X-CSRF-Token")
        
        # Amélioration Sécurité 9: Aussi accepter le token dans le formulaire
        if not header_token:
            header_token = request.form.get("csrf_token")
        
        # Amélioration Sécurité 10: Aussi accepter dans le JSON body
        if not header_token and request.is_json:
            try:
                json_data = request.get_json(silent=True)
                if json_data:
                    header_token = json_data.get("_csrf_token") or json_data.get("csrf_token")
            except:
                pass

        # Amélioration Sécurité 21: Accepter aussi le token depuis le cookie (utile pour multipart/form-data)
        if not header_token:
            header_token = request.cookies.get('csrf_token')
        
        # Paths that don't require CSRF token
        exempt_paths = ["/api/auth/login", "/api/auth/register", "/api/csrf-token"]
        if request.path in exempt_paths:
            return
            
        # Partial match for tunnels and file uploads
        if request.path.startswith("/api/tunnel") or request.path.startswith("/api/playit"):
            return

        # Amélioration Sécurité 11: Si pas de token en session, en générer un et rejeter
        if not token:
            generate_csrf_token()  # Générer pour la prochaine fois
            logger.warning(f"[CSRF] REJECTED on {request.path} - no session token")
            return jsonify({
                "status": "error", 
                "message": "Session expirée, veuillez rafraîchir la page",
                "code": "CSRF_ERROR",
                "action": "refresh"
            }), 403

        if token != header_token:
            logger.warning(f"[CSRF] REJECTED on {request.path} - token mismatch")
            return jsonify({
                "status": "error", 
                "message": "CSRF Token invalide",
                "code": "CSRF_ERROR",
                "action": "refresh_token"
            }), 403

def generate_csrf_token():
    if "_csrf_token" not in session:
        session["_csrf_token"] = secrets.token_hex(32)  # Amélioration Sécurité 12: Token plus long
    return session["_csrf_token"]

app.jinja_env.globals['csrf_token'] = generate_csrf_token

# Amélioration Sécurité 13: Route pour récupérer un nouveau token CSRF 
@app.route("/api/csrf-token")
def get_csrf_token():
    """Retourne un nouveau token CSRF et le régénère"""
    token = generate_csrf_token()
    response = jsonify({"csrf_token": token, "status": "success"})
    # Amélioration Sécurité 14: Ajouter le token dans un cookie aussi
    response.set_cookie('csrf_token', token, httponly=False, samesite='Lax', max_age=86400)
    return response

# Amélioration Sécurité 19: Vérification de session active
@app.route("/api/session/check")
def check_session():
    """Vérifie si la session est toujours valide"""
    if "user" in session:
        return jsonify({
            "status": "success",
            "valid": True,
            "user": session["user"]["username"],
            "csrf_token": generate_csrf_token()
        })
    return jsonify({"status": "success", "valid": False}), 401

# Amélioration Sécurité 20: Régénération du token CSRF après login
@app.after_request
def regenerate_csrf_after_login(response):
    """Régénère le token CSRF après une connexion réussie"""
    if request.path == "/api/auth/login" and response.status_code == 200:
        session["_csrf_token"] = secrets.token_hex(32)
    return response

@app.after_request
def add_security_headers(response):
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' data: https:;"
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # Amélioration 1: Headers de sécurité supplémentaires
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    # Amélioration Sécurité: Cache-Control pour les API
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
    if app.config.get('SESSION_COOKIE_SECURE'):
        response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
    return response

# Amélioration 2: Compression GZIP pour les réponses
try:
    from flask_compress import Compress
    compress = Compress()
    compress.init_app(app)
except ImportError:
    pass  # flask-compress optionnel

# Initialiser le gestionnaire d'authentification
auth_mgr = AuthManager()

# Initialiser le monitoring
metrics_collector = MetricsCollector()
metrics_collector.start()

def collect_server_metrics_task():
    """Tâche de fond pour collecter les métriques des serveurs actifs"""
    logger.info("[METRICS] Tâche de collecte des métriques serveurs démarrée")
    while True:
        try:
            # On itère sur les serveurs actifs
            for name in list(srv_mgr.procs.keys()):
                try:
                    status = srv_mgr.get_status(name)
                    if status.get("status") == "online":
                        data = {
                            "cpu": status.get("cpu", 0),
                            "ram": status.get("ram_mb", 0),
                            "players_online": status.get("players_online", 0)
                        }
                        metrics_collector.update_server_metrics(name, data)
                except Exception as e:
                    pass
        except Exception as e:
            logger.error(f"[METRICS] Erreur boucle collecte: {e}")
        time.sleep(15)  # Collecte toutes les 15 secondes

# Initialiser le gestionnaire de tunnel (remplace Playit.gg)
try:
    tunnel_mgr = get_tunnel_manager(os.path.join(os.path.dirname(__file__), "servers"))
    logger.info("[INFO] Tunnel manager initialisé")
except Exception as e:
    logger.warning(f"[WARN] Erreur initialisation tunnel manager: {e}")
    tunnel_mgr = None

# Initialiser le gestionnaire de mods
try:
    from core.mods import ModManager
    mod_mgr = ModManager(os.path.join(os.path.dirname(__file__), "servers"))
    logger.info("[INFO] Mod manager initialisé")
except Exception as e:
    logger.warning(f"[WARN] Erreur initialisation mod manager: {e}")
    mod_mgr = None

# Job manager (background tasks)
try:
    job_mgr = get_job_manager()
    logger.info("[INFO] Job manager initialisé")
except Exception as e:
    logger.warning(f"[WARN] Erreur initialisation job manager: {e}")
    job_mgr = None

logger.info("[INFO] Demarrage MCPanel...")

# essayer de démarrer Docker si le démon est arrêté
try:
    if srv_mgr:
        srv_mgr._try_start_docker()
except Exception as e:
    logger.warning(f"[WARN] échec tentative de démarrage automatique de Docker: {e}")

def check_java():
    try:
        result = subprocess.run(
            ["java", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Extraire la version depuis stderr (Java affiche sur stderr)
            version_output = result.stderr.split('\n')[0] if result.stderr else result.stdout.split('\n')[0]
            logger.info(f"[INFO] Java detecte: {version_output}")
            return True
    except FileNotFoundError:
        logger.warning("[WARN] Java n'est pas installe ou pas dans le PATH")
        logger.warning("[WARN] Telechargez Java 17+ sur https://adoptium.net/")
        logger.warning("[WARN] Les serveurs ne pourront pas demarrer sans Java")
        return False
    except Exception as e:
        logger.warning(f"[WARN] Erreur verification Java: {e}")
        return False

# Initialiser les managers
srv_mgr = ServerManager()
governance_mgr = GovernanceManager(quota_mgr, srv_mgr)
billing_mgr.srv_mgr = srv_mgr
stats_mgr = PlayerStatsManager(srv_mgr.base_dir)
plugin_mgr = PluginManager(srv_mgr.base_dir)
server_monitor = ServerMonitor(srv_mgr, metrics_collector)
server_monitor.start()
backup_scheduler = BackupScheduler(srv_mgr)
file_mgr = FileManager(srv_mgr.base_dir)
config_editor = ConfigEditor(srv_mgr.base_dir)

# Démarrer la collecte des métriques serveurs après initialisation des managers
threading.Thread(target=collect_server_metrics_task, daemon=True).start()

# ===================== ADMIN EXTENSIONS =====================

@app.route("/api/admin/maintenance", methods=["POST"])
@admin_required
def set_maintenance():
    data = request.json
    enable = data.get("enabled", False)
    global MAINTENANCE_MODE
    MAINTENANCE_MODE = enable
    
    if enable:
        with open("data/maintenance.flag", "w") as f: f.write("1")
    else:
        if os.path.exists("data/maintenance.flag"): os.remove("data/maintenance.flag")
        
    auth_mgr._log_audit(session["user"]["username"], "MAINTENANCE", str(enable))
    return jsonify({"status": "success", "maintenance": enable})

@app.route("/api/admin/quotas", methods=["GET", "POST"])
@admin_required
def admin_quotas():
    if request.method == "POST":
        data = request.json
        # Only update user role for simplicity in this demo
        if "user" in data:
            quota_mgr.quotas["user"] = data["user"]
            quota_mgr._save_quotas()
            return jsonify({"status": "success"})
    
    return jsonify({"status": "success", "quotas": quota_mgr.quotas})

@app.route("/api/admin/revoke-user", methods=["POST"])
@admin_required
def revoke_user_sessions():
    """Révoque les sessions d'un utilisateur"""
    username = request.json.get("username")
    if username:
        auth_mgr.revoke_user_sessions(username)
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Username required"}), 400

@app.route("/api/server/<name>/cost")
@login_required
def get_server_cost(name):
    """Estime les coûts d'un serveur"""
    config = srv_mgr.get_server_config(name)
    estimation = billing_mgr.estimate_server_cost(config)
    return jsonify({"status": "success", "estimation": estimation})

# ===================== ROUTES PING/STATUS =====================

@app.route("/api/ping")
@login_required
def api_ping():
    """Ping pour vérifier la connexion"""
    return jsonify({"status": "ok", "timestamp": time.time()})

@app.route("/api/status")
@login_required
def api_status():
    """Statut global de l'application"""
    return jsonify({
        "status": "ok",
        "version": "2.0",
        "timestamp": time.time()
    })


# ===================== SCHEDULER =====================

@app.route("/api/schedules")
@login_required
def api_get_all_schedules():
    return jsonify({"status": "success", "schedules": backup_scheduler.get_all_schedules()})


@app.route("/api/server/<name>/schedule")
@login_required
def api_get_schedule(name):
    return jsonify({"status": "success", "schedule": backup_scheduler.get_schedule(name)})


@app.route("/api/server/<name>/schedule", methods=["POST"])
@admin_required
def api_set_schedule(name):
    data = request.json
    result = backup_scheduler.set_schedule(name, data)
    if result.get("success"):
        auth_mgr._log_audit(session["user"]["username"], "SCHEDULE_SET", f"{name}: {data.get('type')}")
        return jsonify(result)
    return jsonify(result), 400


@app.route("/api/server/<name>/schedule", methods=["DELETE"])
@admin_required
def api_remove_schedule(name):
    result = backup_scheduler.remove_schedule(name)
    auth_mgr._log_audit(session["user"]["username"], "SCHEDULE_REMOVE", name)
    return jsonify(result)


@app.route("/api/server/<name>/backup/now", methods=["POST"])
@login_required
def api_backup_now(name):
    result = backup_scheduler.trigger_backup_now(name)
    auth_mgr._log_audit(session["user"]["username"], "BACKUP_MANUAL", name)
    return jsonify(result)


# ===================== MONITORING =====================

@app.route("/api/metrics/system")
@login_required
def api_system_metrics():
    return jsonify(metrics_collector.get_current_system())


@app.route("/api/metrics/history")
@login_required
def api_metrics_history():
    limit = request.args.get("limit", 60, type=int)
    return jsonify({"status": "success", "data": metrics_collector.get_system_metrics(limit)})


@app.route("/api/metrics/server/<name>")
@login_required
def api_server_metrics(name):
    limit = request.args.get("limit", 60, type=int)
    return jsonify({"status": "success", "data": metrics_collector.get_server_metrics(name, limit)})


@app.route("/api/alerts")
@login_required
def api_alerts():
    unread = request.args.get("unread", "false").lower() == "true"
    return jsonify({"status": "success", "alerts": server_monitor.get_alerts(unread)})


@app.route("/api/alerts/read", methods=["POST"])
@login_required
def api_mark_alerts_read():
    server_monitor.mark_alerts_read()
    return jsonify({"status": "success"})


@app.route("/api/server/<name>/autorestart")
@login_required
def get_autorestart(name):
    config = server_monitor.get_auto_restart_config(name)
    return jsonify({"status": "success", "config": config})


@app.route("/api/server/<name>/autorestart", methods=["POST"])
@login_required
def set_autorestart(name):
    data = request.json
    server_monitor.set_auto_restart(
        name,
        enabled=data.get("enabled", True),
        max_restarts=data.get("max_restarts", 3)
    )
    return jsonify({"status": "success"})


# ===================== NOTIFICATIONS =====================

@app.route("/api/notifications")
@login_required
def api_get_notifications():
    limit = request.args.get("limit", 50, type=int)
    unread = request.args.get("unread", "false").lower() == "true"
    return jsonify({
        "status": "success", 
        "notifications": notification_manager.get_notifications(limit, unread)
    })


@app.route("/api/notifications/read", methods=["POST"])
@login_required
def api_mark_notifications_read():
    data = request.json or {}
    notification_id = data.get("id")
    result = notification_manager.mark_read(notification_id)
    return jsonify(result)


@app.route("/api/notifications/clear", methods=["POST"])
@admin_required
def api_clear_notifications():
    result = notification_manager.clear_notifications()
    return jsonify(result)


@app.route("/api/notifications/config")
@admin_required
def api_get_notifications_config():
    return jsonify({"status": "success", "config": notification_manager.get_config()})


@app.route("/api/notifications/config", methods=["POST"])
@admin_required
def api_save_notifications_config():
    data = request.json
    result = notification_manager.save_config(data)
    auth_mgr._log_audit(session["user"]["username"], "NOTIF_CONFIG", "Configuration modifiée")
    return jsonify(result)


@app.route("/api/notifications/test/discord", methods=["POST"])
@admin_required
def api_test_discord():
    data = request.json
    result = notification_manager.test_discord(data.get("webhook_url", ""))
    return jsonify(result)


@app.route("/api/notifications/test/email", methods=["POST"])
@admin_required
def api_test_email():
    data = request.json
    result = notification_manager.test_email(data)
    return jsonify(result)


# ===================== I18N =====================

@app.route("/api/i18n/translations")
def api_get_translations():
    lang = request.args.get("lang")
    if lang:
        i18n.set_language(lang)
    return jsonify({
        "status": "success",
        "lang": i18n.get_language(),
        "translations": i18n.get_all_translations()
    })


@app.route("/api/i18n/language", methods=["POST"])
def api_set_language():
    data = request.json or {}
    lang = data.get("lang") or request.args.get("lang") or "fr"
    if i18n.set_language(lang):
        resp = make_response(jsonify({"status": "success", "lang": lang}))
        # Persist language in cookie for long-term preference
        resp.set_cookie("mcp_lang", lang, max_age=60 * 60 * 24 * 365, samesite="Lax")
        return resp
    return jsonify({"status": "error", "message": "Langue non supportée"}), 400


@app.route("/api/i18n/languages")
def api_get_languages():
    return jsonify({
        "status": "success",
        "languages": [
            {"code": "fr", "name": "Français", "flag": "🇫🇷"},
            {"code": "en", "name": "English", "flag": "🇬🇧"},
            {"code": "es", "name": "Español", "flag": "🇪🇸"}
        ],
        "current": i18n.get_language()
    })


# ===================== AUTH =====================

@app.route("/login")
def login():
    if "user" in session:
        return redirect(url_for("index"))
    return render_template("login.html")


@app.route("/logout")
def logout():
    if "user" in session:
        auth_mgr._log_audit(session["user"]["username"], "LOGOUT", "Déconnexion")
        session.pop("user", None)
    return redirect(url_for("login"))


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "Données manquantes"}), 400
    
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    # Get real IP if behind proxy
    if request.headers.getlist("X-Forwarded-For"):
        ip = request.headers.getlist("X-Forwarded-For")[0]
    else:
        ip = request.remote_addr
            
    otp = data.get('otp')
    # Diagnostic: call authenticate and log result server-side for debugging
    user, error = auth_mgr.authenticate(username, password, client_ip=ip, otp=otp)
    logger.debug(f"[AUTH DEBUG] authenticate returned user={bool(user)} error={error}")
    if user:
        session.clear()
        session.permanent = True
        session["user"] = user
        session["login_time"] = int(time.time()) # Added for revocation
        session["_csrf_token"] = secrets.token_hex(32)
        auth_mgr._log_audit(username, "LOGIN_SUCCESS_SESSION", ip)
        return jsonify({"status": "success", "user": user})
    return jsonify({"status": "error", "message": error or "Identifiants incorrects"}), 401


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "Données manquantes"}), 400
    
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    if not username or not password:
        return jsonify({"status": "error", "message": "Nom d'utilisateur et mot de passe requis"}), 400
    
    success, msg = auth_mgr.create_user(username, password, role="user")
    if success:
        # Auto-login après inscription
        user, _ = auth_mgr.authenticate(username, password)
        session.clear()
        session.permanent = True
        session["user"] = user
        return jsonify({"status": "success", "user": user})
    return jsonify({"status": "error", "message": msg or "Erreur"}), 400


# Debug endpoint (admin only) — utile pour diagnostiquer pourquoi une connexion échoue
@app.route('/api/debug/user/<username>')
@admin_required
def debug_get_user(username):
    """Retourne des infos non sensibles sur l'utilisateur (admin only)."""
    try:
        from core.db import get_session, User
        s = get_session()
        u = s.query(User).filter(User.username == username).first()
        if not u:
            return jsonify({"found": False}), 404
        return jsonify({
            "found": True,
            "username": u.username,
            "role": u.role,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "failed_attempts": u.failed_attempts or 0,
            "locked_until": u.locked_until.isoformat() if getattr(u, 'locked_until', None) else None,
            "needs_password_reset": bool(getattr(u, 'needs_password_reset', False)),
            "totp_enabled": bool(getattr(u, 'totp_enabled', False))
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        if user:
            session["user"] = user
            return jsonify({"status": "success", "message": "Compte créé avec succès", "user": user})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/auth/user")
def api_current_user():
    if "user" in session:
        return jsonify({"status": "success", "user": session["user"]})
    return jsonify({"status": "error", "message": "Non connecté"}), 401


@app.route('/api/auth/2fa/start', methods=['POST'])
@login_required
def api_2fa_start():
    username = session['user']['username']
    secret, uri = auth_mgr.generate_2fa_secret(username)
    # Return secret/uri so client can display QR code for provisioning
    return jsonify({'status': 'success', 'secret': secret, 'uri': uri})


@app.route('/api/auth/2fa/confirm', methods=['POST'])
@login_required
def api_2fa_confirm():
    data = request.json or {}
    secret = data.get('secret')
    code = data.get('code')
    username = session['user']['username']
    ok, msg = auth_mgr.enable_2fa(username, secret, code)
    if ok:
        # update session user
        session['user']['role'] = session['user'].get('role')
        return jsonify({'status': 'success', 'message': msg})
    return jsonify({'status': 'error', 'message': msg}), 400


@app.route('/api/auth/2fa/disable', methods=['POST'])
@login_required
def api_2fa_disable():
    data = request.json or {}
    password = data.get('password')
    code = data.get('code')
    username = session['user']['username']
    ok, msg = auth_mgr.disable_2fa(username, password, code)
    if ok:
        return jsonify({'status': 'success', 'message': msg})
    return jsonify({'status': 'error', 'message': msg}), 400


@app.route('/api/auth/password/request-reset', methods=['POST'])
def api_request_password_reset():
    data = request.json or {}
    identifier = data.get('username') or data.get('email')
    if not identifier:
        return jsonify({'status': 'error', 'message': 'username or email required'}), 400
    ok, token_or_msg = auth_mgr.request_password_reset(identifier)
    if ok:
        # in real setup we would email token; for now return token when running locally/tests
        return jsonify({'status': 'success', 'token': token_or_msg})
    return jsonify({'status': 'error', 'message': token_or_msg}), 400


@app.route('/api/auth/password/reset', methods=['POST'])
def api_password_reset():
    data = request.json or {}
    username = data.get('username')
    token = data.get('token')
    new_password = data.get('new_password')
    if not all([username, token, new_password]):
        return jsonify({'status': 'error', 'message': 'missing fields'}), 400
    ok, msg = auth_mgr.reset_password(username, token, new_password)
    if ok:
        return jsonify({'status': 'success', 'message': msg})
    return jsonify({'status': 'error', 'message': msg}), 400


@app.route("/api/auth/admin/default_changed")
def api_admin_default_changed():
    """Indique si le mot de passe par défaut de l'utilisateur admin a été changé"""
    users = auth_mgr._load_users()
    changed = users.get('admin', {}).get('default_password_changed', False)
    return jsonify({"status": "success", "default_changed": bool(changed)})


@app.route("/api/auth/users")
@admin_required
def api_list_users():
    return jsonify({"status": "success", "users": auth_mgr.list_users()})


@app.route("/api/auth/users", methods=["POST"])
@admin_required
def api_create_user():
    data = request.json
    success, msg = auth_mgr.create_user(
        data.get("username", ""),
        data.get("password", ""),
        data.get("role", "user"),
        data.get("email", "")
    )
    if success:
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/auth/users/<username>", methods=["PUT"])
@admin_required
def api_update_user(username):
    data = request.json
    success, msg = auth_mgr.update_user(username, data)
    if success:
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/auth/users/<username>", methods=["DELETE"])
@admin_required
def api_delete_user(username):
    success, msg = auth_mgr.delete_user(username)
    if success:
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/auth/password", methods=["POST"])
@login_required
def api_change_password():
    data = request.json
    success, msg = auth_mgr.change_password(
        session["user"]["username"],
        data.get("old_password", ""),
        data.get("new_password", "")
    )
    if success:
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/auth/audit")
@admin_required
def api_audit_logs():
    return jsonify({"status": "success", "logs": auth_mgr.get_audit_logs()})


# ===================== FILE MANAGER =====================

@app.route("/api/server/<name>/files/list")
@login_required
def files_list(name):
    path = request.args.get("path", "")
    return jsonify({"status": "success", "files": file_mgr.list_files(name, path)})


@app.route("/api/server/<name>/files/read")
@login_required
def files_read(name):
    path = request.args.get("path", "")
    try:
        content = file_mgr.read_file(name, path)
        return jsonify({"status": "success", "content": content})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/files/save", methods=["POST"])
@login_required
def files_save(name):
    data = request.json
    try:
        file_mgr.save_file(name, data.get("path"), data.get("content"))
        auth_mgr._log_audit(session["user"]["username"], "FILE_EDIT", f"{name}: {data.get('path')}")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/files/mkdir", methods=["POST"])
@login_required
def files_mkdir(name):
    data = request.json
    try:
        file_mgr.create_directory(name, data.get("path"), data.get("name"))
        auth_mgr._log_audit(session["user"]["username"], "FILE_MKDIR", f"{name}: {data.get('name')}")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/files/delete", methods=["POST"])
@login_required
def files_delete(name):
    data = request.json
    try:
        file_mgr.delete_item(name, data.get("path"))
        auth_mgr._log_audit(session["user"]["username"], "FILE_DELETE", f"{name}: {data.get('path')}")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/files/rename", methods=["POST"])
@login_required
def files_rename(name):
    data = request.json
    try:
        file_mgr.rename_item(name, data.get("path"), data.get("new_name"))
        auth_mgr._log_audit(session["user"]["username"], "FILE_RENAME", f"{name}: {data.get('path')} -> {data.get('new_name')}")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/files/upload", methods=["POST"])
@login_required
def files_upload(name):
    try:
        path = request.form.get("path", "")
        files = request.files.getlist("files")
        uploaded = file_mgr.handle_upload(name, path, files)
        auth_mgr._log_audit(session["user"]["username"], "FILE_UPLOAD", f"{name}: {len(uploaded)} files")
        return jsonify({"status": "success", "uploaded": uploaded})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/config/whitelist", methods=["GET", "POST"])
@login_required
def config_whitelist(name):
    if request.method == "POST":
        config_editor.save_whitelist(name, request.json)
        auth_mgr._log_audit(session["user"]["username"], "WHITELIST_EDIT", name)
        return jsonify({"status": "success"})
    return jsonify({"status": "success", "data": config_editor.get_whitelist(name)})


@app.route("/api/server/<name>/config/ops", methods=["GET", "POST"])
@login_required
def config_ops(name):
    if request.method == "POST":
        config_editor.save_ops(name, request.json)
        auth_mgr._log_audit(session["user"]["username"], "OPS_EDIT", name)
        return jsonify({"status": "success"})
    return jsonify({"status": "success", "data": config_editor.get_ops(name)})


@app.route("/api/server/<name>/config/banned-players", methods=["GET", "POST"])
@login_required
def config_banned_players(name):
    if request.method == "POST":
        config_editor.save_banned_players(name, request.json)
        auth_mgr._log_audit(session["user"]["username"], "BANNED_PLAYERS_EDIT", name)
        return jsonify({"status": "success"})
    return jsonify({"status": "success", "data": config_editor.get_banned_players(name)})


@app.route("/api/server/<name>/config/banned-ips", methods=["GET", "POST"])
@login_required
def config_banned_ips(name):
    if request.method == "POST":
        config_editor.save_banned_ips(name, request.json)
        auth_mgr._log_audit(session["user"]["username"], "BANNED_IPS_EDIT", name)
        return jsonify({"status": "success"})
    return jsonify({"status": "success", "data": config_editor.get_banned_ips(name)})


@app.route("/api/server/<name>/files/download")
@login_required
def files_download(name):
    path = request.args.get("path", "")
    try:
        abs_path = file_mgr.get_download_path(name, path)
        return send_file(abs_path, as_attachment=True)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


# ===================== ROUTES PRINCIPALES =====================

@app.route("/")
@login_required
def index():
    # Allow overriding language via query param to enable direct links like /?lang=en
    lang = request.args.get("lang")
    resp = None
    if lang and i18n.set_language(lang):
        resp = make_response(render_template("index_pro.html"))
        resp.set_cookie("mcp_lang", lang, max_age=60 * 60 * 24 * 365, samesite="Lax")
        return resp
    return render_template("index_pro.html")


@app.route("/api/papermc/versions")
@login_required
def get_versions():
    return jsonify(srv_mgr.get_available_versions())


@app.route("/api/papermc/builds/<version>")
@login_required
def get_paper_builds(version):
    """Récupère les informations sur les builds Paper pour une version"""
    try:
        build_info = srv_mgr.get_paper_build_info(version)
        return jsonify({"status": "success", **build_info})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/papermc/download-url/<version>")
@login_required
def get_paper_download_url(version):
    """Génère l'URL de téléchargement Paper"""
    try:
        build = request.args.get("build", type=int)
        url = srv_mgr.get_paper_download_url(version, build)
        return jsonify({"status": "success", "url": url, "version": version})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/servers")
@login_required
def list_servers():
    owner = session["user"]["username"]
    if session["user"].get("role") == "admin":
        owner = "admin"
    return jsonify(srv_mgr.list_servers(owner))


@app.route("/api/forge/versions")
@login_required
def get_forge_versions():
    return jsonify({"status": "success", "versions": srv_mgr.get_forge_versions()})


@app.route("/api/forge/builds/<version>")
@login_required
def get_forge_builds(version):
    """Récupère les builds Forge pour une version MC"""
    try:
        builds = srv_mgr.get_forge_builds(version)
        return jsonify({"status": "success", **builds})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/fabric/versions")
@login_required
def get_fabric_versions():
    return jsonify({"status": "success", "versions": srv_mgr.get_fabric_versions()})


@app.route("/api/fabric/loaders/<mc_version>")
@login_required
def get_fabric_loaders(mc_version):
    """Récupère les loaders Fabric compatibles avec une version MC"""
    try:
        loaders = srv_mgr.get_fabric_loader_for_game(mc_version)
        # loaders is a list of strings
        return jsonify({"status": "success", "loaders": loaders})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route('/favicon.ico')
def favicon():
    try:
        return send_file(os.path.join(app.static_folder, 'img', 'default_icon.svg'), mimetype='image/svg+xml')
    except Exception:
        return ('', 204)


@app.route("/api/neoforge/versions")
@login_required
def get_neoforge_versions():
    """Récupère les versions NeoForge (fork moderne de Forge)"""
    try:
        versions = srv_mgr.get_neoforge_versions()
        return jsonify({"status": "success", **versions})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/quilt/versions")
@login_required
def get_quilt_versions():
    """Récupère les versions Quilt (fork de Fabric)"""
    try:
        versions = srv_mgr.get_quilt_versions()
        return jsonify({"status": "success", **versions})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# ===================== MODS API (Modrinth) =====================

@app.route("/api/mods/search")
@login_required
def mods_search():
    """Recherche des mods sur Modrinth"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        query = request.args.get("q", "")
        loader = request.args.get("loader")  # forge, fabric, neoforge, quilt
        mc_version = request.args.get("version")
        limit = request.args.get("limit", 20, type=int)
        offset = request.args.get("offset", 0, type=int)
        
        result = mod_mgr.search(query, loader, mc_version, limit, offset)
        return jsonify({"status": "success", **result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/mods/popular")
@login_required
def mods_popular():
    """Récupère les mods les plus populaires"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        loader = request.args.get("loader")
        mc_version = request.args.get("version")
        limit = request.args.get("limit", 20, type=int)
        
        result = mod_mgr.get_popular_mods(loader, mc_version, limit)
        return jsonify({"status": "success", **result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/mods/details/<project_id>")
@login_required
def mods_details(project_id):
    """Récupère les détails d'un mod"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        details = mod_mgr.get_mod_details(project_id)
        return jsonify({"status": "success", **details})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/mods/versions/<project_id>")
@login_required
def mods_versions(project_id):
    """Récupère les versions disponibles d'un mod"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        loader = request.args.get("loader")
        mc_version = request.args.get("version")
        
        versions = mod_mgr.get_mod_versions(project_id, loader, mc_version)
        return jsonify({"status": "success", "versions": versions})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/mods/categories")
@login_required
def mods_categories():
    """Récupère les catégories de mods"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        categories = mod_mgr.get_categories()
        return jsonify({"status": "success", "categories": categories})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/mods/loaders")
@login_required
def mods_loaders():
    """Récupère les loaders de mods disponibles"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        loaders = mod_mgr.get_loaders()
        return jsonify({"status": "success", "loaders": loaders})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/mods/compatible")
@login_required
def mods_compatible():
    """Vérifie les versions compatibles d'un mod pour une MC version et loader"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"}), 500

        project_id = request.args.get("project_id")
        loader = request.args.get("loader")
        mc_version = request.args.get("version")

        if not project_id:
            return jsonify({"status": "error", "message": "project_id requis"}), 400

        versions = mod_mgr.get_mod_versions(project_id, loader=loader, mc_version=mc_version)
        return jsonify({"status": "success", "versions": versions})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# ===================== JOBS API =====================
@app.route("/api/jobs/install-mods", methods=["POST"])
@login_required
def jobs_install_mods():
    try:
        if job_mgr is None:
            return jsonify({"status": "error", "message": "Job manager non initialisé"}), 500
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"}), 500

        data = request.json or {}
        server_name = data.get("server_name")
        mods = data.get("mods", [])
        loader = data.get("loader")
        mc_version = data.get("mc_version")

        if not server_name or not isinstance(mods, list) or not mods:
            return jsonify({"status": "error", "message": "server_name et mods requis"}), 400

        def worker(job, server_name, mods, loader, mc_version):
            results = []
            for i, m in enumerate(mods):
                project_id = m.get("project_id")
                version_id = m.get("version_id")
                job.progress = int((i / max(1, len(mods))) * 100)
                job.logs.append(f"Installing {project_id}...")
                try:
                    res = mod_mgr.install(server_name, project_id, version_id, loader, mc_version)
                    results.append({"project_id": project_id, **res})
                    job.logs.append(f"Installed {project_id}: {res.get('message','ok')}")
                except Exception as e:
                    results.append({"project_id": project_id, "success": False, "message": str(e)})
                    job.logs.append(f"Error {project_id}: {e}")
                time.sleep(0.1)
            job.result = {"mods": results}
            return job.result

        job = job_mgr.create_job("install-mods", worker, server_name, mods, loader, mc_version)
        return jsonify({"status": "success", "job_id": job.id})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/jobs/<job_id>")
@login_required
def jobs_get(job_id):
    try:
        if job_mgr is None:
            return jsonify({"status": "error", "message": "Job manager non initialisé"}), 500
        job = job_mgr.get_job(job_id)
        if not job:
            return jsonify({"status": "error", "message": "Job introuvable"}), 404
        return jsonify({
            "status": "success",
            "job": {
                "id": job.id,
                "type": job.type,
                "status": job.status,
                "progress": job.progress,
                "created_at": job.created_at,
                "finished_at": job.finished_at,
                "result": job.result
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/jobs/<job_id>/logs")
@login_required
def jobs_logs(job_id):
    try:
        if job_mgr is None:
            return jsonify({"status": "error", "message": "Job manager non initialisé"}), 500
        job = job_mgr.get_job(job_id)
        if not job:
            return jsonify({"status": "error", "message": "Job introuvable"}), 404
        return jsonify({"status": "success", "logs": job.logs[-200:]})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/jobs/<job_id>/cancel", methods=["POST"])
@login_required
def jobs_cancel(job_id):
    try:
        if job_mgr is None:
            return jsonify({"status": "error", "message": "Job manager non initialisé"}), 500
        ok = job_mgr.cancel_job(job_id)
        if not ok:
            return jsonify({"status": "error", "message": "Impossible d'annuler le job"}), 400
        return jsonify({"status": "success", "message": "Job cancelled"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/server/<name>/mods")
@login_required
def server_mods_list(name):
    """Liste les mods installés sur un serveur"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        mods = mod_mgr.list_installed(name)
        return jsonify({"status": "success", "mods": mods})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/server/<name>/mods/install", methods=["POST"])
@login_required
def server_mods_install(name):
    """Installe un mod sur un serveur"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        data = request.json or {}
        project_id = data.get("project_id")
        version_id = data.get("version_id")
        loader = data.get("loader")
        mc_version = data.get("mc_version")

        # Si loader ou mc_version absents, essayer de les déduire depuis la config du serveur
        try:
            server_cfg = srv_mgr.get_server_config(name)
            if not loader:
                # config peut contenir 'server_type' ou 'loader_version'
                loader = server_cfg.get('loader_version') or server_cfg.get('server_type')
            if not mc_version:
                mc_version = server_cfg.get('version') or server_cfg.get('mc_version')
        except Exception:
            pass
        
        if not project_id:
            return jsonify({"status": "error", "message": "project_id requis"}), 400
        
        result = mod_mgr.install(name, project_id, version_id, loader, mc_version)
        # Normaliser la réponse pour renvoyer toujours un champ 'status'
        if isinstance(result, dict) and result.get('success'):
            return jsonify({"status": "success", **result})
        # Erreur connue renvoyée par mod_mgr
        if isinstance(result, dict) and not result.get('success'):
            return jsonify({"status": "error", "message": result.get('message', 'Erreur installation')}), 400
        # Fallback
        return jsonify({"status": "error", "message": "Erreur installation"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/server/<name>/mods/uninstall", methods=["POST"])
@login_required
def server_mods_uninstall(name):
    """Désinstalle un mod d'un serveur"""
    try:
        if mod_mgr is None:
            return jsonify({"status": "error", "message": "Mod manager non initialisé"})
        
        data = request.json or {}
        filename = data.get("filename")
        
        if not filename:
            return jsonify({"status": "error", "message": "filename requis"}), 400
        # Prevent uninstalling from wrong server type (plugins vs mods)
        try:
            cfg = srv_mgr.get_server_config(name)
            stype = cfg.get('server_type') or srv_mgr.detect_server_type(name)
        except Exception:
            stype = 'paper'

        # if filename ends with .jar and server is paper -> plugin uninstall
        if filename.endswith('.jar') and stype != 'paper':
            # For modded servers, uninstall expects file names in mods folder
            res = mod_mgr.uninstall(name, filename)
            if res.get('success'):
                return jsonify({"status": "success", **res})
            return jsonify({"status": "error", "message": res.get('message', 'Erreur suppression')}), 400

        result = mod_mgr.uninstall(name, filename)
        if isinstance(result, dict) and result.get('success'):
            return jsonify({"status": "success", **result})
        if isinstance(result, dict) and not result.get('success'):
            return jsonify({"status": "error", "message": result.get('message', 'Erreur suppression')}), 400
        return jsonify({"status": "error", "message": "Erreur suppression"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/templates")
@login_required
def get_templates():
    """Retourne les templates de serveurs disponibles"""
    try:
        templates = srv_mgr.get_server_templates()
        return jsonify({"status": "success", "templates": templates})
    except Exception as e:
        logger.error(f"[ERROR] Erreur récup templates: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/create", methods=["POST"])
@login_required
def create():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "error", "message": "Données manquantes"}), 400
        
        name = data.get("name", "").strip()
        
        # Quota Check (via GovernanceManager)
        user_role = session["user"].get("role", "user")
        username = session["user"]["username"]
        
        requested = {
            "count": 1,
            "memory": data.get("ram_max", "2048M"),
            "cpu": float(data.get("cpu_limit", 1.0) or 1.0)
        }
        
        governance_check = governance_mgr.check_action_allowed(username, user_role, requested)
        if not governance_check["allowed"]:
             auth_mgr._log_audit(username, "CREATE_DENIED", governance_check["reason"])
             return jsonify({"status": "error", "message": governance_check["reason"]}), 403

        version = data.get("version", "").strip()
        ram_min = data.get("ram_min", "1024M")
        ram_max = data.get("ram_max", "2048M")
        cpu_limit = data.get("cpu_limit")
        storage_limit = data.get("storage_limit")
        base_path = data.get("base_path", "").strip()
        server_type = data.get("server_type", "paper")
        loader_version = data.get("loader_version")
        forge_version = data.get("forge_version")
        port = data.get("port")
        
        if not name or not version:
            return jsonify({"status": "error", "message": "Nom et version requis"}), 400
        
        # Créer le serveur avec toutes les options
        srv_mgr.create_server(
            name=name,
            version=version,
            ram_min=ram_min,
            ram_max=ram_max,
            cpu_limit=cpu_limit,
            storage_limit=storage_limit,
            base_path=base_path if base_path else None,
            server_type=server_type,
            loader_version=loader_version,
            forge_version=forge_version,
            owner=session["user"]["username"],
            port=port
        )

        # Ensure meta is stored reliably even if create_server had internal fallbacks
        try:
            srv_mgr.set_server_meta(name, version=version, server_type=server_type, loader_version=loader_version, forge_version=forge_version)
        except Exception as e:
            logger.warning(f"[WARN] set_server_meta after create failed: {e}")

        # Si des mods sont fournis, tenter de les installer (synchronique)
        mods_payload = data.get("mods", []) if isinstance(data.get("mods", []), list) else []
        mods_results = []
        if mods_payload:
            if mod_mgr is None:
                return jsonify({"status": "error", "message": "Mod manager non initialisé"}), 500

            # Pour chaque mod, vérifier la compatibilité et installer
            for m in mods_payload:
                project_id = m.get("project_id")
                version_id = m.get("version_id")

                if not project_id:
                    mods_results.append({"project_id": None, "success": False, "message": "project_id requis"})
                    continue

                # Vérifier compatibilité si mc_version/loader fournis
                try:
                    compatible_versions = mod_mgr.get_mod_versions(project_id, loader=loader_version, mc_version=version)
                except Exception as e:
                    compatible_versions = []

                if version_id:
                    # vérifier que la version demandée est compatible
                    ok = any(v.get("id") == version_id for v in compatible_versions)
                    if not ok:
                        mods_results.append({"project_id": project_id, "success": False, "message": "Version incompatible ou introuvable"})
                        continue

                # Installer
                try:
                    res = mod_mgr.install(name, project_id, version_id, loader=loader_version, mc_version=version)
                    mods_results.append({"project_id": project_id, **res})
                except Exception as e:
                    mods_results.append({"project_id": project_id, "success": False, "message": str(e)})

        return jsonify({"status": "success", "mods": mods_results})
    except Exception as e:
        logger.exception("Erreur critique lors de la création")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/<action>", methods=["POST"])
@login_required
def server_action(name, action):
    try:
        srv_mgr.action(name, action)
        action_messages = {
            "start": "Serveur démarré",
            "stop": "Serveur arrêté",
            "restart": "Serveur redémarré"
        }
        auth_mgr._log_audit(session["user"]["username"], f"SERVER_{action.upper()}", name)
        return jsonify({
            "status": "success", 
            "message": action_messages.get(action, "Action effectuée")
        })
    except Exception as e:
        logger.error(f"[ERROR] Erreur action {action}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/status")
@login_required
def status(name):
    return jsonify(srv_mgr.get_status(name))


@app.route("/api/server/<name>/logs")
@login_required
def logs(name):
    # owner / admin check
    cfg = srv_mgr.get_server_config(name)
    owner = cfg.get("owner")
    user = session.get("user", {}).get("username")
    role = session.get("user", {}).get("role")
    if role != "admin" and owner != user:
        return jsonify({"error": "Forbidden"}), 403
    lines = request.args.get("lines", 100, type=int)
    filter_type = request.args.get("filter")
    search = request.args.get("search")
    return jsonify({"logs": srv_mgr.get_logs(name, lines, filter_type, search)})


@app.route("/api/server/<name>/logs/files")
@login_required
def logs_files(name):
    cfg = srv_mgr.get_server_config(name)
    owner = cfg.get("owner")
    user = session.get("user", {}).get("username")
    role = session.get("user", {}).get("role")
    if role != "admin" and owner != user:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"status": "success", "files": srv_mgr.get_logs_files(name)})


@app.route("/api/server/<name>/rcon", methods=["POST"])
@login_required
def rcon_command(name):
    data = request.json
    cmd = data.get("command", "")
    
    # Get RCON config from server properties
    props = srv_mgr.get_properties(name)
    if props.get("enable-rcon", "false") != "true":
        return jsonify({"status": "error", "message": "RCON not enabled"}), 400
    
    port = int(props.get("rcon.port", 25575))
    password = props.get("rcon.password", "")
    
    if not password:
        return jsonify({"status": "error", "message": "RCON password not set"}), 400
    
    client = RconClient("localhost", port, password)
    result, error = client.command(cmd)
    client.close()
    
    if error:
        return jsonify({"status": "error", "message": error}), 500
    
    auth_mgr._log_audit(session["user"]["username"], "RCON", f"{name}: {cmd}")
    return jsonify({"status": "success", "response": result})


@app.route("/api/server/<name>/rcon/config")
@login_required
def rcon_config(name):
    props = srv_mgr.get_properties(name)
    return jsonify({
        "status": "success",
        "config": {
            "enabled": props.get("enable-rcon", "false") == "true",
            "port": props.get("rcon.port", "25575"),
            "password": props.get("rcon.password", "")
        }
    })


@app.route("/api/server/<name>/rcon/config", methods=["POST"])
@login_required
def set_rcon_config(name):
    data = request.json
    props = srv_mgr.get_properties(name)
    
    props["enable-rcon"] = "true" if data.get("enabled") else "false"
    props["rcon.port"] = str(data.get("port", 25575))
    props["rcon.password"] = data.get("password", "")
    
    srv_mgr.save_properties(name, props)
    return jsonify({"status": "success"})


@app.route("/api/server/<name>/command", methods=["POST"])
@login_required
def command(name):
    try:
        cmd = request.json["command"]
        srv_mgr.send_command(name, cmd)
        auth_mgr._log_audit(session["user"]["username"], "COMMAND", f"{name}: {cmd}")
        return jsonify({"status": "success", "message": "Commande envoyée"})
    except Exception as e:
        logger.error(f"[ERROR] Erreur commande: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/rename", methods=["POST"])
@login_required
def rename_server(name):
    try:
        new_name = request.json.get("new_name")
        if not new_name:
            return jsonify({"status": "error", "message": "Nouveau nom requis"}), 400
            
        srv_mgr.rename_server(name, new_name)
        auth_mgr._log_audit(session["user"]["username"], "RENAME", f"{name} -> {new_name}")
        return jsonify({"status": "success", "message": f"Serveur renommé en {new_name}"})
    except Exception as e:
        logger.error(f"[ERROR] Erreur renommage: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>", methods=["DELETE"])
@login_required
def delete(name):
    try:
        srv_mgr.delete_server(name)
        auth_mgr._log_audit(session["user"]["username"], "SERVER_DELETE", name)
        return jsonify({"status": "success", "message": "Serveur supprimé avec succès"})
    except Exception as e:
        logger.error(f"[ERROR] Erreur suppression: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/properties", methods=["GET", "POST"])
@login_required
def server_properties_config(name):
    try:
        if request.method == "POST":
            srv_mgr.save_properties(name, request.json)
            auth_mgr._log_audit(session["user"]["username"], "PROPERTIES_UPDATE", name)
            return jsonify({"status": "success", "message": "Propriétés sauvegardées"})
        return jsonify(srv_mgr.get_properties(name))
    except Exception as e:
        logger.error(f"[ERROR] Erreur propriétés: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/docker", methods=["GET", "POST"])
@login_required
def docker_config(name):
    user_role = session.get("user", {}).get("role", "user")
    quota = quota_mgr.get_quota(user_role)
    
    try:
        if request.method == "POST":
            if not quota.get("allow_resource_edit") and user_role != "admin":
                return jsonify({"status": "error", "message": "Vous n'avez pas l'autorisation de modifier les ressources."}), 403
                
            data = request.json
            
            # Quota Check (via GovernanceManager)
            requested = {
                "count": 1,
                "memory": data.get("ram_max"),
                "cpu": float(data.get("cpu_limit", 1.0) or 1.0)
            }
            
            gov_check = governance_mgr.check_action_allowed(session["user"]["username"], user_role, requested, exclude_server=name)
            if not gov_check["allowed"]:
                 return jsonify({"status": "error", "message": gov_check["reason"]}), 403

            srv_mgr.update_docker_resources(
                name,
                port=data.get("port"),
                ram_max=data.get("ram_max"),
                ram_min=data.get("ram_min"),
                cpu_limit=data.get("cpu_limit"),
                version=data.get("version"),
                server_type=data.get("server_type")
            )
            auth_mgr._log_audit(session["user"]["username"], "DOCKER_UPDATE", f"{name}: {data}")
            return jsonify({"status": "success", "message": "Configuration Docker mise à jour"})
        
        # GET
        data = srv_mgr.get_docker_resources(name)
        return jsonify({
            "status": "success", 
            "config": data,
            "can_edit": quota.get("allow_resource_edit") or user_role == "admin"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/stats")
@login_required
def server_stats(name):
    """Retourne les statistiques détaillées du serveur"""
    try:
        status = srv_mgr.get_status(name)
        disk_usage = srv_mgr.get_disk_usage(name) or {}
        plugins = plugin_mgr.list_installed(name) or []
        
        # Calculer le temps de fonctionnement si online
        uptime = "--"
        if status.get("status") == "online" and name in srv_mgr.procs:
            import time
            start_time = getattr(srv_mgr, f"_start_time_{name}", None)
            if start_time:
                elapsed = int(time.time() - start_time)
                hours, remainder = divmod(elapsed, 3600)
                minutes, seconds = divmod(remainder, 60)
                uptime = f"{hours}h {minutes}m {seconds}s"
        
        # Obtenir la version depuis la config
        config = srv_mgr.get_server_config(name) or {}
        version = config.get("version", status.get("version", "--"))
        
        # plugins est une liste, pas un dict
        plugin_count = len(plugins) if isinstance(plugins, list) else 0
        
        return jsonify({
            "status": "success",
            "uptime": uptime,
            "version": version,
            "disk_usage": f"{disk_usage.get('used_mb', 0):.1f} MB" if disk_usage else "--",
            "plugin_count": plugin_count,
            "players_online": status.get("players_online", 0),
            "max_players": status.get("max_players", 20),
            "tps": status.get("tps", "--"),
            "cpu": status.get("cpu", 0),
            "ram_mb": status.get("ram_mb", 0)
        })
    except Exception as e:
        logger.error(f"[ERROR] Erreur stats: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/players")
@login_required
def players(name):
    return jsonify(stats_mgr.get_all_players(name))


@app.route("/api/server/<name>/online-players")
@login_required
def online_players(name):
    """Récupère la liste des joueurs actuellement en ligne via RCON ou logs"""
    try:
        # Essayer via RCON d'abord
        if name in srv_mgr.procs:
            try:
                from core.rcon import RconClient
                config = srv_mgr.get_server_config(name) or {}
                rcon_port = config.get('rcon_port', 25575)
                rcon_password = config.get('rcon_password', '')
                
                if rcon_password:
                    rcon = RconClient('localhost', rcon_port, rcon_password)
                    success, msg = rcon.connect()
                    if success:
                        response, error = rcon.command('list')
                        rcon.close()
                        
                        if response:
                            # Parser la réponse "There are X of Y players online: player1, player2"
                            import re
                            match = re.search(r':\s*(.+)$', response)
                            if match:
                                player_names = [p.strip() for p in match.group(1).split(',') if p.strip()]
                                return jsonify({"players": player_names, "count": len(player_names)})
                            
                            # Alternative: "There are 0 of Y players online"
                            match = re.search(r'There are (\d+)', response)
                            if match and int(match.group(1)) == 0:
                                return jsonify({"players": [], "count": 0})
            except Exception as e:
                logger.warning(f"[WARN] RCON indisponible for {name}: {e}")
        
        # Fallback: analyser les logs récents
        log_file = os.path.join(srv_mgr.base_dir, name, "logs", "latest.log")
        online_players = set()
        
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()[-200:]  # Dernières 200 lignes
                    
                for line in lines:
                    # Détecter les connexions
                    if 'joined the game' in line or 'logged in with' in line:
                        import re
                        match = re.search(r'\]: (\w+) (joined|logged in)', line)
                        if match:
                            online_players.add(match.group(1))
                    
                    # Détecter les déconnexions
                    if 'left the game' in line or 'lost connection' in line:
                        import re
                        match = re.search(r'\]: (\w+) (left|lost)', line)
                        if match:
                            online_players.discard(match.group(1))
            except Exception as e:
                logger.warning(f"[WARN] Erreur lecture logs {name}: {e}")
        
        return jsonify({"players": list(online_players), "count": len(online_players)})
        
    except Exception as e:
        logger.error(f"[ERROR] Erreur online-players: {e}")
        return jsonify({"players": [], "count": 0, "error": str(e)})


@app.route("/api/server/<name>/player/<uuid>")
@login_required
def player_details(name, uuid):
    # Force save before reading to get real-time data
    if name in srv_mgr.procs:
        try:
            srv_mgr.send_command(name, "save-all")
            import time
            time.sleep(0.5)  # Wait for save
        except:
            pass
    return jsonify(stats_mgr.get_player_details(name, uuid))


@app.route("/api/server/<name>/player/action", methods=["POST"])
@login_required
def player_action(name):
    d = request.json
    cmd = ""
    t = d["pseudo"]
    if d["act"] == "op":
        cmd = f"op {t}"
    elif d["act"] == "deop":
        cmd = f"deop {t}"
    elif d["act"] == "gm_c":
        cmd = f"gamemode creative {t}"
    elif d["act"] == "gm_s":
        cmd = f"gamemode survival {t}"
    elif d["act"] == "kick":
        cmd = f"kick {t}"
    elif d["act"] == "ban":
        cmd = f"ban {t}"
    elif d["act"] == "clear":
        cmd = f"clear {t}"
    elif d["act"] == "kill":
        cmd = f"kill {t}"

    if cmd:
        srv_mgr.send_command(name, cmd)
    return jsonify({"status": "success"})


@app.route("/api/plugins/search")
@app.route("/api/hangar/search")
@login_required
def search_plugins():
    return jsonify(plugin_mgr.search(request.args.get("q", "")))


@app.route("/api/server/<name>/plugins/installed")
@login_required
def list_installed_plugins(name):
    return jsonify(plugin_mgr.list_installed(name))


@app.route("/api/server/<name>/plugins/install", methods=["POST"])
@login_required
def install_plugin(name):
    d = request.json
    slug = d.get("slug", "")
    if "/" in slug:
        parts = slug.split("/")
        author = parts[0] if len(parts) > 0 else ""
        plugin_name = parts[1] if len(parts) > 1 else slug
    else:
        author = d.get("author", "")
        plugin_name = slug
    
    res = plugin_mgr.install(name, author, plugin_name)
    if res.get("success", False):
        return jsonify({"status": "success", "message": "Plugin installé"})
    return jsonify({"status": "error", "message": res.get("message", "Installation échouée")}), 500


@app.route("/api/server/<name>/plugins")
@login_required
def list_plugins(name):
    return jsonify(plugin_mgr.list_installed(name))


@app.route("/api/server/<name>/plugins/uninstall", methods=["POST"])
@login_required
def uninstall_plugin(name):
    d = request.json
    plugin_name = d.get("name", "")
    res = plugin_mgr.uninstall(name, plugin_name)
    if res.get("success", False):
        return jsonify({"status": "success", "message": "Plugin désinstallé"})
    return jsonify({"status": "error", "message": res.get("message", "Désinstallation échouée")}), 500


@app.route("/api/server/<name>/plugins/upload", methods=["POST"])
@login_required
def upload_plugin(name):
    try:
        if 'plugin' not in request.files:
            return jsonify({"status": "error", "message": "Aucun fichier envoyé"}), 400
        
        file = request.files['plugin']
        if file.filename == '':
            return jsonify({"status": "error", "message": "Aucun fichier sélectionné"}), 400
        
        if not file.filename.endswith('.jar'):
            return jsonify({"status": "error", "message": "Le fichier doit être un .jar"}), 400
        
        from werkzeug.utils import secure_filename
        filename = secure_filename(file.filename)
        
        # Vérifier le type de serveur: n'accepter que pour Paper/Spigot
        try:
            cfg = srv_mgr.get_server_config(name)
            stype = cfg.get('server_type') or srv_mgr.detect_server_type(name)
        except Exception:
            stype = 'paper'

        if stype != 'paper':
            return jsonify({"status": "error", "message": f"Serveur de type '{stype}' détecté: upload de plugins (.jar Bukkit) non supporté. Utilisez l'onglet Mods pour installer des mods."}), 400

        # Fix: Plugins are inside data/plugins for docker servers
        plugins_dir = os.path.join("servers", name, "data", "plugins")
        if not os.path.exists(plugins_dir):
            # Fallback for legacy
            legacy = os.path.join("servers", name, "plugins")
            if os.path.exists(legacy):
                plugins_dir = legacy
            else:
                 os.makedirs(plugins_dir, exist_ok=True)
        
        filepath = os.path.join(plugins_dir, filename)
        file.save(filepath)
        
        auth_mgr._log_audit(session["user"]["username"], "PLUGIN_UPLOAD", f"{name}/{filename}")
        return jsonify({"status": "success", "message": f"Plugin {filename} installé"})
    except Exception as e:
        logger.error(f"[ERROR] Erreur upload plugin: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/mods/upload", methods=["POST"])
@login_required
def upload_mod(name):
    try:
        if 'mod' not in request.files:
            return jsonify({"status": "error", "message": "Aucun fichier envoyé"}), 400

        file = request.files['mod']
        if file.filename == '':
            return jsonify({"status": "error", "message": "Aucun fichier sélectionné"}), 400

        if not file.filename.endswith('.jar'):
            return jsonify({"status": "error", "message": "Le fichier doit être un .jar"}), 400

        from werkzeug.utils import secure_filename
        filename = secure_filename(file.filename)

        # Vérifier le type de serveur: n'accepter que pour les serveurs moddés
        try:
            cfg = srv_mgr.get_server_config(name)
            stype = cfg.get('server_type') or srv_mgr.detect_server_type(name)
        except Exception:
            cfg = {}
            stype = None

        # Accept upload when config explicitly indicates a modded server OR when a mods/ directory exists
        server_path = os.path.join(srv_mgr.base_dir, name)
        mods_dir = os.path.join(server_path, 'mods')
        explicit_modded = bool(cfg.get('server_type') in ['fabric', 'forge', 'neoforge', 'quilt'] or cfg.get('loader_version') or cfg.get('forge_version'))
        if stype == 'paper' and not explicit_modded and not os.path.exists(mods_dir):
            # If no explicit modded meta and no mods dir exists, create the mods dir and accept the upload
            try:
                os.makedirs(mods_dir, exist_ok=True)
                logger.info(f"[INFO] Created mods directory for server {name} to accept manual mod upload")
                # Proceed with upload (do not force change of server meta automatically)
            except Exception as e:
                return jsonify({"status": "error", "message": f"Impossible de préparer le répertoire /mods: {e}"}), 500

        mods_dir = os.path.join('servers', name, 'mods')
        os.makedirs(mods_dir, exist_ok=True)

        filepath = os.path.join(mods_dir, filename)
        file.save(filepath)

        auth_mgr._log_audit(session["user"]["username"], "MOD_UPLOAD", f"{name}/{filename}")
        return jsonify({"status": "success", "message": f"Mod {filename} uploadé"})
    except Exception as e:
        logger.error(f"[ERROR] Erreur upload mod: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/config", methods=["GET", "POST"])
@login_required
def server_config(name):
    # permission: owner or admin only
    cfg = srv_mgr.get_server_config(name) or {}
    owner = cfg.get("owner")
    user = session.get("user", {}).get("username")
    role = session.get("user", {}).get("role")
    if role != "admin" and owner != user:
        return jsonify({"error": "Forbidden"}), 403

    if request.method == "POST":
        # Merge incoming partial config with existing config to avoid overwriting meta
        incoming = request.json or {}
        try:
            from datetime import datetime
            existing = srv_mgr.get_server_config(name) or {}
            merged = {**existing, **incoming}
            srv_mgr.save_server_config(name, merged)
            # Log concise trace for debugging race overwrites
            try:
                snippet_in = json.dumps(incoming, ensure_ascii=False)
                if len(snippet_in) > 200:
                    snippet_in = snippet_in[:200] + '...'
            except Exception:
                snippet_in = '<unserializable>'
            logger.debug(f"[DEBUG] {datetime.now().isoformat()} API POST /api/server/{name}/config incoming_keys={list(incoming.keys())} merged_keys={list(merged.keys())} incoming_snippet={snippet_in}")
            return jsonify({"status": "success"})
        except Exception as e:
            logger.error(f"[ERROR] API /api/server/{name}/config save failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500
    cfg = srv_mgr.get_server_config(name)
    try:
        logger.debug(f"[DEBUG] {datetime.now().isoformat()} API GET /api/server/{name}/config returning_keys={list(cfg.keys())}")
    except Exception:
        logger.debug(f"[DEBUG] API GET /api/server/{name}/config returning (unserializable)")
    return jsonify(cfg)


@app.route("/api/server/<name>/meta", methods=["POST"])
@admin_required
def set_server_meta(name):
    """Met à jour la méta d'un serveur: version, server_type, loader_version, forge_version"""
    data = request.json or {}
    version = data.get('version')
    server_type = data.get('server_type')
    loader_version = data.get('loader_version')
    forge_version = data.get('forge_version')
    try:
        ok = srv_mgr.set_server_meta(name, version=version, server_type=server_type, loader_version=loader_version, forge_version=forge_version)
        if not ok:
            return jsonify({"status": "error", "message": "Impossible de mettre à jour la méta"}), 400
        auth_mgr._log_audit(session["user"]["username"], "SERVER_META_SET", f"{name}: {server_type}/{version}")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/server/<name>/backup", methods=["POST"])
@login_required
def backup_server(name):
    try:
        result = srv_mgr.backup_server(name)
        auth_mgr._log_audit(session["user"]["username"], "BACKUP_CREATE", name)
        return jsonify({"status": "success", "backup": result, "message": "Sauvegarde créée"})
    except Exception as e:
        logger.error(f"[ERROR] Erreur backup: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/backups")
@login_required
def list_backups(name):
    return jsonify(srv_mgr.list_backups(name))


@app.route("/api/server/<name>/backups/<backup_name>", methods=["DELETE"])
@login_required
def delete_backup(name, backup_name):
    try:
        backup_path = os.path.join("servers", "_backups", backup_name)
        if os.path.exists(backup_path):
            import shutil
            shutil.rmtree(backup_path)
            return jsonify({"status": "success", "message": "Sauvegarde supprimée"})
        return jsonify({"status": "error", "message": "Sauvegarde non trouvée"}), 404
    except Exception as e:
        logger.error(f"[ERROR] Erreur suppression backup: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/java/info")
@login_required
def get_java_info():
    java_versions = {}
    java_dir = os.path.join("servers", "_java")
    
    if os.path.exists(java_dir):
        for folder in os.listdir(java_dir):
            if folder.startswith("java-"):
                version = folder.replace("java-", "")
                java_path = srv_mgr._get_java_path(int(version))
                java_versions[version] = {
                    "installed": java_path is not None,
                    "path": java_path
                }
    
    java_requirements = {
        "1.21+": "Java 21",
        "1.18-1.20": "Java 17",
        "1.17": "Java 16",
        "1.12-1.16": "Java 8"
    }
    
    return jsonify({
        "installed": java_versions,
        "requirements": java_requirements
    })


@app.route("/api/server/<name>/ops")
@login_required
def get_ops(name):
    return jsonify(stats_mgr.get_ops(name))


@app.route("/api/server/<name>/banned")
@login_required
def get_banned(name):
    return jsonify(stats_mgr.get_banned(name))


@app.route("/api/server/<name>/whitelist")
@login_required
def get_whitelist(name):
    return jsonify(stats_mgr.get_whitelist(name))


# ===================== WORLDS =====================

@app.route("/api/server/<name>/worlds")
@login_required
def list_worlds(name):
    return jsonify({"status": "success", "worlds": srv_mgr.list_worlds(name)})


@app.route("/api/server/<name>/worlds/<world>/reset", methods=["POST"])
@admin_required
def reset_world(name, world):
    success, msg = srv_mgr.reset_world(name, world)
    if success:
        auth_mgr._log_audit(session["user"]["username"], "WORLD_RESET", f"{name}/{world}")
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/server/<name>/worlds/<world>/export")
@login_required
def export_world(name, world):
    from flask import send_file
    zip_path = srv_mgr.export_world(name, world)
    if zip_path:
        return send_file(zip_path, as_attachment=True, download_name=f"{world}.zip")
    return jsonify({"status": "error", "message": "World not found"}), 404


@app.route("/api/server/<name>/worlds/import", methods=["POST"])
@admin_required
def import_world(name):
    if 'world' not in request.files:
        return jsonify({"status": "error", "message": "No file"}), 400
    
    file = request.files['world']
    world_name = request.form.get('name')
    
    success, msg = srv_mgr.import_world(name, file, world_name)
    if success:
        auth_mgr._log_audit(session["user"]["username"], "WORLD_IMPORT", f"{name}/{msg}")
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


# ===================== WHITELIST MANAGEMENT =====================

@app.route("/api/server/<name>/whitelist/add", methods=["POST"])
@login_required
def add_whitelist(name):
    data = request.json
    success, msg = srv_mgr.add_to_whitelist(name, data.get("username", ""))
    if success:
        # Also send command if server is running
        if name in srv_mgr.procs:
            srv_mgr.send_command(name, f"whitelist add {data.get('username')}")
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/server/<name>/whitelist/remove", methods=["POST"])
@login_required
def remove_whitelist(name):
    data = request.json
    success, msg = srv_mgr.remove_from_whitelist(name, data.get("username", ""))
    if success:
        if name in srv_mgr.procs:
            srv_mgr.send_command(name, f"whitelist remove {data.get('username')}")
        return jsonify({"status": "success", "message": msg})
    return jsonify({"status": "error", "message": msg}), 400


# ===================== DISK USAGE =====================

@app.route("/api/server/<name>/disk")
@login_required
def get_disk_usage(name):
    usage = srv_mgr.get_disk_usage(name)
    if usage:
        return jsonify({"status": "success", "usage": usage})
    return jsonify({"status": "error", "message": "Server not found"}), 404


# ===================== RESOURCE PACKS =====================

@app.route("/api/server/<name>/resourcepack")
@login_required
def get_resource_pack(name):
    return jsonify({"status": "success", "config": srv_mgr.get_resource_pack_config(name)})


@app.route("/api/server/<name>/resourcepack", methods=["POST"])
@login_required
def set_resource_pack(name):
    data = request.json
    srv_mgr.set_resource_pack(
        name,
        data.get("url", ""),
        data.get("sha1", ""),
        data.get("required", False)
    )
    return jsonify({"status": "success"})


# ===================== DATAPACKS =====================

@app.route("/api/server/<name>/datapacks")
@login_required
def list_datapacks(name):
    world = request.args.get("world", "world")
    return jsonify({"status": "success", "datapacks": srv_mgr.list_datapacks(name, world)})


@app.route("/api/server/<name>/datapacks/upload", methods=["POST"])
@login_required
def upload_datapack(name):
    if 'datapack' not in request.files:
        return jsonify({"status": "error", "message": "No file"}), 400
    
    file = request.files['datapack']
    world = request.form.get('world', 'world')
    
    if srv_mgr.add_datapack(name, file, world):
        return jsonify({"status": "success", "message": "Datapack added"})
    return jsonify({"status": "error", "message": "Failed"}), 500


@app.route("/api/server/<name>/datapacks/<pack>", methods=["DELETE"])
@login_required
def delete_datapack(name, pack):
    world = request.args.get("world", "world")
    if srv_mgr.remove_datapack(name, pack, world):
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Not found"}), 404





# ===================== PORT MANAGEMENT =====================

@app.route("/api/ports/available")
@login_required
def get_available_port():
    start = request.args.get("start", 25565, type=int)
    port = srv_mgr.find_available_port(start)
    if port:
        return jsonify({"status": "success", "port": port})
    return jsonify({"status": "error", "message": "No port available"}), 500


# ===================== TUNNEL MANAGER (Remplace Playit.gg) =====================

@app.route("/api/tunnel/providers")
@login_required
def tunnel_providers():
    """Liste des providers de tunnel disponibles"""
    try:
        if tunnel_mgr is None:
            raise Exception("Tunnel manager non initialisé")
        return jsonify({"providers": tunnel_mgr.get_available_providers()})
    except Exception as e:
        # Providers par défaut en cas d'erreur
        default_providers = [
            {"id": "playit", "name": "playit.gg", "description": "Meilleur pour Minecraft", "status": "recommended"},
            {"id": "ngrok", "name": "ngrok", "description": "TCP gratuit fiable", "status": "recommended"},
            {"id": "bore", "name": "Bore", "description": "TCP léger en Rust", "status": "available"},
            {"id": "serveo", "name": "Serveo", "description": "SSH gratuit", "status": "available"},
            {"id": "manual", "name": "Port Manuel", "description": "Redirection manuelle", "status": "available"}
        ]
        return jsonify({"providers": default_providers, "error": str(e)})

@app.route("/api/tunnel/start", methods=["POST"])
@login_required
def tunnel_start():
    """Démarre un tunnel"""
    try:
        if tunnel_mgr is None:
            return jsonify({"status": "error", "message": "Tunnel manager non initialisé"})
        data = request.json or {}
        port = data.get("port", 25565)
        provider = data.get("provider", None)
        secret_key = data.get("secret_key", None)
        result = tunnel_mgr.start(provider=provider, port=port, secret_key=secret_key)
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)})

@app.route("/api/tunnel/stop", methods=["POST"])
@login_required
def tunnel_stop():
    """Arrête le tunnel"""
    try:
        if tunnel_mgr is None:
            return jsonify({"status": "error", "message": "Tunnel manager non initialisé"})
        result = tunnel_mgr.stop()
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route("/api/tunnel/status")
@login_required
def tunnel_status():
    """Statut du tunnel"""
    try:
        if tunnel_mgr is None:
            return jsonify({"status": "inactive", "running": False})
        return jsonify(tunnel_mgr.get_status())
    except Exception as e:
        return jsonify({"status": "error", "running": False, "message": str(e)})

@app.route("/api/tunnel/logs")
@login_required
def tunnel_logs():
    """Logs du tunnel"""
    try:
        if tunnel_mgr is None:
            return jsonify({"logs": []})
        return jsonify({"logs": tunnel_mgr.get_logs()})
    except Exception as e:
        return jsonify({"logs": [], "error": str(e)})

@app.route("/api/tunnel/test")
@login_required
def tunnel_test():
    """Teste la connexion au port local"""
    try:
        if tunnel_mgr is None:
            return jsonify({"status": "error", "message": "Tunnel manager non initialisé"})
        return jsonify(tunnel_mgr.test_connection())
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

# Routes de compatibilité avec l'ancien API Playit
@app.route("/api/playit/start", methods=["POST"])
@login_required
def playit_start():
    """Compatibilité avec l'ancien API"""
    try:
        data = request.json or {}
        port = data.get("port", 25565)
        result = tunnel_mgr.start(port=port)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route("/api/playit/stop", methods=["POST"])
@login_required
def playit_stop():
    """Compatibilité avec l'ancien API"""
    try:
        result = tunnel_mgr.stop()
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route("/api/playit/status")
@login_required
def playit_status():
    """Compatibilité avec l'ancien API"""
    try:
        return jsonify(tunnel_mgr.get_status())
    except Exception as e:
        return jsonify({"status": "error", "running": False, "message": str(e)})

@app.route("/api/playit/logs")
@login_required
def playit_logs():
    """Compatibilité avec l'ancien API"""
    try:
        return jsonify({"logs": tunnel_mgr.get_logs()})
    except Exception as e:
        return jsonify({"logs": [], "error": str(e)})


@app.route("/api/tunnel/install/<provider>", methods=["POST"])
@login_required
def tunnel_install_provider(provider):
    """Installe un provider de tunnel spécifique"""
    try:
        if tunnel_mgr is None:
            return jsonify({"status": "error", "message": "Tunnel manager non initialisé"})
        
        if provider == "playit":
            success = tunnel_mgr._install_playit()
        elif provider == "ngrok":
            success = tunnel_mgr._install_ngrok()
        elif provider == "bore":
            success = tunnel_mgr._install_bore()
        elif provider == "cloudflared":
            success = tunnel_mgr._install_cloudflared()
        else:
            return jsonify({"status": "error", "message": f"Provider inconnu: {provider}"})
        
        if success:
            return jsonify({"status": "success", "message": f"{provider} installé avec succès"})
        else:
            return jsonify({"status": "error", "message": f"Échec de l'installation de {provider}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/tunnel/config", methods=["GET", "POST"])
@login_required
def tunnel_config():
    """Configure les paramètres du tunnel (secret keys, etc.)"""
    try:
        if tunnel_mgr is None:
            return jsonify({"status": "error", "message": "Tunnel manager non initialisé"})
        
        if request.method == "GET":
            return jsonify({
                "provider": tunnel_mgr.config.provider.value,
                "local_port": tunnel_mgr.config.local_port,
                "auto_reconnect": tunnel_mgr.config.auto_reconnect,
                "has_playit_secret": bool(tunnel_mgr.config.playit_secret),
                "has_ngrok_token": bool(tunnel_mgr.config.ngrok_authtoken)
            })
        else:
            data = request.json or {}
            if "playit_secret" in data:
                tunnel_mgr.config.playit_secret = data["playit_secret"]
            if "ngrok_authtoken" in data:
                tunnel_mgr.config.ngrok_authtoken = data["ngrok_authtoken"]
            if "auto_reconnect" in data:
                tunnel_mgr.config.auto_reconnect = data["auto_reconnect"]
            
            tunnel_mgr._save_config()
            return jsonify({"status": "success", "message": "Configuration mise à jour"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/server/<name>/icon/raw")
@login_required
def get_server_icon_raw(name):
    try:
        server_dir = file_mgr._get_secure_path(name, "")
        icon_path = os.path.join(server_dir, "server-icon.png")
        if os.path.exists(icon_path):
            return send_file(icon_path, mimetype='image/png')
        else:
            # Return a 200 with the default icon so the client doesn't log 404 errors
            default_icon = os.path.join(app.static_folder or 'app/static', 'img', 'default_icon.svg')
            if os.path.exists(default_icon):
                return send_file(default_icon, mimetype='image/svg+xml')
            return "Not found", 404
    except Exception as e:
        logger.error(f"[ERROR] get_server_icon_raw failed for {name}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/icon/status")
@login_required
def get_server_icon_status(name):
    try:
        server_dir = file_mgr._get_secure_path(name, "")
        icon_path = os.path.join(server_dir, "server-icon.png")
        exists = os.path.exists(icon_path)
        return jsonify({"status": "success", "exists": exists, "path": icon_path if exists else None})
    except Exception as e:
        logger.error(f"[ERROR] get_server_icon_status failed for {name}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ===================== MODS MANAGER =====================

@app.route("/api/mods/search", methods=["POST"])
@login_required
def search_mods():
    query = request.json.get("query", "")
    limit = request.json.get("limit", 20)
    results = srv_mgr.search_mods(query, limit)
    return jsonify({"status": "success", "results": results})

@app.route("/api/server/<name>/optimize", methods=["POST"])
@login_required
def optimize_server_flags(name):
    try:
        success, msg = srv_mgr.optimize_server(name)
        if success:
             auth_mgr._log_audit(session["user"]["username"], "OPTIMIZE", name)
             return jsonify({"status": "success", "message": msg})
        return jsonify({"status": "error", "message": msg}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ===================== NOUVELLES FONCTIONNALITES =====================

@app.route("/api/system/info")
@login_required
def system_info():
    """Informations système complètes"""
    import psutil
    import platform
    
    try:
        cpu_count = psutil.cpu_count()
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(os.path.abspath("servers"))
        
        return jsonify({
            "status": "success",
            "system": {
                "os": platform.system(),
                "os_version": platform.version()[:50],
                "python_version": sys.version.split()[0],
                "hostname": platform.node()
            },
            "cpu": {
                "count": cpu_count,
                "percent": cpu_percent
            },
            "memory": {
                "total_gb": round(memory.total / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "percent": memory.percent
            },
            "disk": {
                "total_gb": round(disk.total / (1024**3), 2),
                "used_gb": round(disk.used / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "percent": round(disk.used / disk.total * 100, 1)
            },
            "servers": {
                "total": len(srv_mgr.list_servers()),
                "running": len(srv_mgr.procs)
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/system/history")
@login_required
def system_history():
    """Historique des métriques système pour les graphiques"""
    try:
        limit = int(request.args.get("limit", 60)) # Default 60 points (5 mins approx)
        data = metrics_collector.get_system_metrics(limit)
        return jsonify({"status": "success", "history": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/system/docker-status')
@login_required
def api_docker_status():
    """Retourne si Docker est présent sur la machine (bool)."""
    try:
        return jsonify({"installed": is_docker_installed()})
    except Exception:
        return jsonify({"installed": False}), 500


@app.route('/api/system/install-docker', methods=['POST'])
@admin_required
def api_install_docker():
    """Lance l'installation automatique de Docker pour l'OS courant.
    Paramètres (optionnels) : ?async=true|false (par défaut true).
    Retourne immédiatement un `task_id` et un `log` si async, sinon le résultat synchronisé.
    """
    try:
        if is_docker_installed():
            return jsonify({"status": "already_installed", "message": "Docker est déjà installé"})

        async_flag = request.args.get('async', 'true').lower() != 'false'
        if async_flag:
            res = install_docker_async()
            return jsonify({"status": "started", "task": res.get('task_id'), "log": res.get('log')})

        res = install_docker_sync()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/console/stream")
@login_required
def console_stream(name):
    """Stream des logs en temps réel via SSE"""
    cfg = srv_mgr.get_server_config(name)
    owner = cfg.get("owner")
    user = session.get("user", {}).get("username")
    role = session.get("user", {}).get("role")
    if role != "admin" and owner != user:
        return jsonify({"error": "Forbidden"}), 403
    def generate():
        last_pos = 0
        while True:
            try:
                logs = srv_mgr.get_logs(name, 50)
                if logs:
                    yield f"data: {json.dumps({'logs': logs})}\n\n"
                time.sleep(2)
            except GeneratorExit:
                break
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                break
    
    return Response(generate(), mimetype='text/event-stream')


@app.route("/api/server/<name>/quick-action", methods=["POST"])
@login_required
def quick_action(name):
    """Actions rapides sur le serveur"""
    data = request.json or {}
    action = data.get("action", "")
    
    quick_commands = {
        "save": "save-all",
        "weather_clear": "weather clear",
        "weather_rain": "weather rain",
        "weather_thunder": "weather thunder",
        "time_day": "time set day",
        "time_night": "time set night",
        "difficulty_peaceful": "difficulty peaceful",
        "difficulty_easy": "difficulty easy",
        "difficulty_normal": "difficulty normal",
        "difficulty_hard": "difficulty hard",
        "say": f"say {data.get('message', 'Hello!')}",
        "stop_warning": "say §c§lServeur arrêt dans 30 secondes!"
    }
    
    if action in quick_commands:
        try:
            srv_mgr.send_command(name, quick_commands[action])
            return jsonify({"status": "success", "message": f"Action '{action}' exécutée"})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    
    return jsonify({"status": "error", "message": "Action inconnue"}), 400


@app.route("/api/server/<name>/player/<player>/stats")
@login_required
def get_player_stats(name, player):
    """Statistiques détaillées d'un joueur"""
    try:
        stats = stats_mgr.get_player_stats_by_name(name, player) if hasattr(stats_mgr, 'get_player_stats_by_name') else {}
        return jsonify({
            "status": "success",
            "player": player,
            "health": stats.get("health", 20),
            "food": stats.get("food", 20),
            "xp_level": stats.get("xp_level", 0),
            "playtime": stats.get("playtime", 0),
            "deaths": stats.get("deaths", 0),
            "position": stats.get("position", "N/A"),
            "gamemode": stats.get("gamemode", "survival")
        })
    except Exception as e:
        # Retourner des valeurs par défaut si pas de stats
        return jsonify({
            "status": "success",
            "player": player,
            "health": 20,
            "food": 20,
            "xp_level": 0,
            "playtime": 0,
            "deaths": 0,
            "position": "N/A",
            "gamemode": "survival"
        })


@app.route("/api/server/<name>/performance")
@login_required
def server_performance(name):
    """Métriques de performance détaillées"""
    try:
        status = srv_mgr.get_status(name)
        metrics = metrics_collector.get_server_metrics(name, 30)
        
        # Calculer les moyennes
        avg_cpu = sum(m.get("cpu", 0) for m in metrics) / len(metrics) if metrics else 0
        avg_ram = sum(m.get("ram_mb", 0) for m in metrics) / len(metrics) if metrics else 0
        
        return jsonify({
            "status": "success",
            "current": {
                "cpu": status.get("cpu", 0),
                "ram_mb": status.get("ram_mb", 0),
                "tps": status.get("tps", 20),
                "players": status.get("players_online", 0)
            },
            "average": {
                "cpu": round(avg_cpu, 1),
                "ram_mb": round(avg_ram, 0)
            },
            "history": metrics[-10:] if metrics else []
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/health")
def health_check():
    """Endpoint de santé pour monitoring externe"""
    from datetime import datetime
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "servers_running": len(srv_mgr.procs),
        "version": "2.0.0"
    })


# ===================== AMÉLIORATIONS 3-60 =====================

# Amélioration 3: Export des logs en fichier
@app.route("/api/server/<name>/logs/export")
@login_required
def export_logs(name):
    """Exporte les logs du serveur en fichier téléchargeable"""
    try:
        logs = srv_mgr.get_logs(name, lines=10000)
        log_content = "\n".join(logs) if isinstance(logs, list) else str(logs)
        
        from io import BytesIO
        buffer = BytesIO(log_content.encode('utf-8'))
        buffer.seek(0)
        
        from datetime import datetime
        filename = f"{name}_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        return send_file(buffer, as_attachment=True, download_name=filename, mimetype='text/plain')
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 4: Recherche dans les logs
@app.route("/api/server/<name>/logs/search")
@login_required
def search_logs(name):
    """Recherche dans les logs du serveur"""
    query = request.args.get("q", "").lower()
    lines = request.args.get("lines", 1000, type=int)
    
    try:
        logs = srv_mgr.get_logs(name, lines=lines)
        if query:
            logs = [log for log in logs if query in log.lower()]
        return jsonify({"status": "success", "logs": logs, "count": len(logs)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 5: Clone de serveur
@app.route("/api/server/<name>/clone", methods=["POST"])
@admin_required
def clone_server(name):
    """Clone un serveur existant"""
    import shutil
    data = request.json or {}
    new_name = data.get("new_name", f"{name}_clone")
    
    try:
        src = os.path.join(srv_mgr.base_dir, name)
        dst = os.path.join(srv_mgr.base_dir, new_name)
        
        if not os.path.exists(src):
            return jsonify({"status": "error", "message": "Serveur source non trouvé"}), 404
        if os.path.exists(dst):
            return jsonify({"status": "error", "message": "Un serveur avec ce nom existe déjà"}), 400
        
        shutil.copytree(src, dst)
        
        # Modifier le port pour éviter les conflits
        props_path = os.path.join(dst, "server.properties")
        if os.path.exists(props_path):
            props = srv_mgr.get_properties(new_name)
            old_port = int(props.get("server-port", 25565))
            props["server-port"] = str(old_port + 1)
            srv_mgr.save_properties(new_name, props)
        
        auth_mgr._log_audit(session["user"]["username"], "SERVER_CLONE", f"{name} -> {new_name}")
        return jsonify({"status": "success", "message": f"Serveur cloné: {new_name}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 6: Import de monde (ZIP simple)
@app.route("/api/server/<name>/world/import-zip", methods=["POST"])
@login_required
def import_world_zip(name):
    """Importe un monde depuis un fichier ZIP"""
    try:
        if 'world' not in request.files:
            return jsonify({"status": "error", "message": "Aucun fichier envoyé"}), 400
        
        file = request.files['world']
        if not file.filename.endswith('.zip'):
            return jsonify({"status": "error", "message": "Le fichier doit être un ZIP"}), 400
        
        import zipfile
        import tempfile
        
        world_path = os.path.join(srv_mgr.base_dir, name, "world")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp:
            file.save(tmp.name)
            
            with zipfile.ZipFile(tmp.name, 'r') as zip_ref:
                zip_ref.extractall(world_path)
            
            os.unlink(tmp.name)
        
        auth_mgr._log_audit(session["user"]["username"], "WORLD_IMPORT", name)
        return jsonify({"status": "success", "message": "Monde importé avec succès"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 7: Export de monde principal (ZIP)
@app.route("/api/server/<name>/world/export-zip")
@login_required
def export_world_main(name):
    """Exporte le monde principal du serveur en ZIP"""
    try:
        import zipfile
        import tempfile
        from datetime import datetime
        
        world_path = os.path.join(srv_mgr.base_dir, name, "world")
        if not os.path.exists(world_path):
            return jsonify({"status": "error", "message": "Monde non trouvé"}), 404
        
        # Créer un ZIP temporaire
        tmp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        
        with zipfile.ZipFile(tmp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(world_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, world_path)
                    zipf.write(file_path, arcname)
        
        filename = f"{name}_world_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        return send_file(tmp_zip.name, as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 8: Statistiques globales
@app.route("/api/stats/global")
@login_required
def global_stats():
    """Statistiques globales de tous les serveurs"""
    try:
        servers = srv_mgr.list_servers()
        total_players = 0
        total_ram = 0
        running_count = 0
        
        for srv in servers:
            status = srv_mgr.get_status(srv["name"])
            if status.get("status") == "online":
                running_count += 1
                total_players += status.get("players_online", 0)
                total_ram += status.get("ram_mb", 0)
        
        return jsonify({
            "status": "success",
            "total_servers": len(servers),
            "running_servers": running_count,
            "total_players": total_players,
            "total_ram_mb": total_ram
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 9: Envoi de message à tous les serveurs
@app.route("/api/broadcast", methods=["POST"])
@admin_required
def broadcast_message():
    """Envoie un message à tous les serveurs en ligne"""
    data = request.json or {}
    message = data.get("message", "")
    
    if not message:
        return jsonify({"status": "error", "message": "Message requis"}), 400
    
    sent_to = []
    for name, proc in srv_mgr.procs.items():
        try:
            srv_mgr.send_command(name, f"say [Broadcast] {message}")
            sent_to.append(name)
        except:
            pass
    
    auth_mgr._log_audit(session["user"]["username"], "BROADCAST", message[:50])
    return jsonify({"status": "success", "sent_to": sent_to})


# Amélioration 10: Liste des ports utilisés
@app.route("/api/ports")
@login_required
def list_ports():
    """Liste tous les ports utilisés par les serveurs"""
    ports = []
    for srv in srv_mgr.list_servers():
        props = srv_mgr.get_properties(srv["name"])
        ports.append({
            "server": srv["name"],
            "port": int(props.get("server-port", 25565)),
            "rcon_port": int(props.get("rcon.port", 25575)) if props.get("enable-rcon") == "true" else None,
            "query_port": int(props.get("query.port", 25565)) if props.get("enable-query") == "true" else None
        })
    return jsonify({"status": "success", "ports": ports})


# Amélioration 11: Vérification de port disponible
@app.route("/api/port/check/<int:port>")
@login_required
def check_port(port):
    """Vérifie si un port est disponible"""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            result = s.connect_ex(('127.0.0.1', port))
            available = result != 0
        return jsonify({"status": "success", "port": port, "available": available})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 12: Suggestion de port libre
@app.route("/api/port/suggest")
@login_required
def suggest_port():
    """Suggère un port libre"""
    import socket
    base_port = 25565
    for offset in range(100):
        port = base_port + offset
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                result = s.connect_ex(('127.0.0.1', port))
                if result != 0:  # Port libre
                    return jsonify({"status": "success", "port": port})
        except:
            continue
    return jsonify({"status": "error", "message": "Aucun port disponible"}), 500


# Amélioration 13: Historique des commandes
@app.route("/api/server/<name>/command/history")
@login_required
def command_history(name):
    """Retourne l'historique des commandes exécutées"""
    try:
        logs = auth_mgr.get_audit_logs()
        commands = [
            log for log in logs 
            if log.get("action") == "COMMAND" and name in log.get("details", "")
        ]
        return jsonify({"status": "success", "commands": commands[-50:]})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 14: Présets de commandes
@app.route("/api/command/presets")
@login_required
def command_presets():
    """Retourne les présets de commandes courantes"""
    presets = {
        "gestion": [
            {"name": "Sauvegarder", "command": "save-all"},
            {"name": "Arrêt planifié 30s", "command": "say Le serveur redémarre dans 30 secondes!"},
            {"name": "Liste joueurs", "command": "list"},
            {"name": "TPS", "command": "tps"}
        ],
        "meteo": [
            {"name": "Soleil", "command": "weather clear"},
            {"name": "Pluie", "command": "weather rain"},
            {"name": "Orage", "command": "weather thunder"}
        ],
        "temps": [
            {"name": "Jour", "command": "time set day"},
            {"name": "Nuit", "command": "time set night"},
            {"name": "Midi", "command": "time set noon"}
        ],
        "gamemode": [
            {"name": "Survie @a", "command": "gamemode survival @a"},
            {"name": "Créatif @a", "command": "gamemode creative @a"},
            {"name": "Spectateur @a", "command": "gamemode spectator @a"}
        ]
    }
    return jsonify({"status": "success", "presets": presets})


# Amélioration 15: Infos version Minecraft
@app.route("/api/minecraft/version/<version>")
@login_required
def minecraft_version_info(version):
    """Retourne les infos sur une version Minecraft"""
    try:
        # API PaperMC
        r = requests.get(f"https://api.papermc.io/v2/projects/paper/versions/{version}", timeout=10)
        if r.status_code == 200:
            data = r.json()
            return jsonify({
                "status": "success",
                "version": version,
                "builds": len(data.get("builds", [])),
                "latest_build": max(data.get("builds", [0]))
            })
        return jsonify({"status": "error", "message": "Version non trouvée"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 16: Vérification de mise à jour Paper
@app.route("/api/server/<name>/update/check")
@login_required
def check_updates(name):
    """Vérifie si une mise à jour est disponible"""
    try:
        config = srv_mgr.get_server_config(name)
        current_version = config.get("version", "")
        
        r = requests.get(f"https://api.papermc.io/v2/projects/paper/versions/{current_version}", timeout=10)
        if r.status_code == 200:
            data = r.json()
            latest_build = max(data.get("builds", [0]))
            current_build = config.get("build", 0)
            
            return jsonify({
                "status": "success",
                "current_version": current_version,
                "current_build": current_build,
                "latest_build": latest_build,
                "update_available": latest_build > current_build
            })
        return jsonify({"status": "success", "update_available": False})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 17: Dashboard résumé
@app.route("/api/dashboard")
@login_required
def dashboard():
    """Données du tableau de bord"""
    try:
        servers = srv_mgr.list_servers()
        running = len(srv_mgr.procs)
        
        # Métriques système
        import psutil
        cpu = psutil.cpu_percent()
        mem = psutil.virtual_memory()
        
        # Alertes récentes
        alerts = list(server_monitor.alerts)[:5] if hasattr(server_monitor, 'alerts') else []
        
        return jsonify({
            "status": "success",
            "servers": {
                "total": len(servers),
                "running": running,
                "stopped": len(servers) - running
            },
            "system": {
                "cpu_percent": cpu,
                "ram_percent": mem.percent,
                "ram_used_gb": round(mem.used / (1024**3), 2)
            },
            "alerts": alerts
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 18: Actions par lot
@app.route("/api/servers/batch", methods=["POST"])
@admin_required
def batch_action():
    """Exécute une action sur plusieurs serveurs"""
    data = request.json or {}
    action = data.get("action", "")
    server_names = data.get("servers", [])
    
    if not action or not server_names:
        return jsonify({"status": "error", "message": "Action et serveurs requis"}), 400
    
    results = {}
    for name in server_names:
        try:
            srv_mgr.action(name, action)
            results[name] = "success"
        except Exception as e:
            results[name] = str(e)
    
    auth_mgr._log_audit(session["user"]["username"], f"BATCH_{action.upper()}", ", ".join(server_names))
    return jsonify({"status": "success", "results": results})


# Amélioration 19: Planification d'arrêt
@app.route("/api/server/<name>/schedule/shutdown", methods=["POST"])
@login_required
def schedule_shutdown(name):
    """Planifie un arrêt du serveur"""
    import threading
    data = request.json or {}
    delay = int(data.get("delay", 60))  # Secondes
    message = data.get("message", "Le serveur va redémarrer!")
    
    def delayed_shutdown():
        for i in [30, 10, 5, 3, 2, 1]:
            if i <= delay:
                try:
                    srv_mgr.send_command(name, f"say §c§l{message} dans {i} secondes!")
                    time.sleep(1)
                except:
                    break
        try:
            srv_mgr.action(name, "stop")
        except:
            pass
    
    threading.Thread(target=delayed_shutdown, daemon=True).start()
    return jsonify({"status": "success", "message": f"Arrêt programmé dans {delay} secondes"})


# Amélioration 20: Statistiques de stockage
@app.route("/api/storage/stats")
@login_required
def storage_stats():
    """Statistiques de stockage détaillées"""
    try:
        servers = srv_mgr.list_servers()
        storage_data = []
        total_size = 0
        
        for srv in servers:
            srv_path = os.path.join(srv_mgr.base_dir, srv["name"])
            if os.path.exists(srv_path):
                size = sum(
                    os.path.getsize(os.path.join(dirpath, filename))
                    for dirpath, dirnames, filenames in os.walk(srv_path)
                    for filename in filenames
                )
                total_size += size
                storage_data.append({
                    "name": srv["name"],
                    "size_mb": round(size / (1024**2), 2)
                })
        
        storage_data.sort(key=lambda x: x["size_mb"], reverse=True)
        
        return jsonify({
            "status": "success",
            "total_mb": round(total_size / (1024**2), 2),
            "servers": storage_data
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 21: Nettoyage des logs anciens
@app.route("/api/server/<name>/logs/cleanup", methods=["POST"])
@admin_required
def cleanup_logs(name):
    """Nettoie les anciens fichiers de log"""
    try:
        logs_path = os.path.join(srv_mgr.base_dir, name, "logs")
        if not os.path.exists(logs_path):
            return jsonify({"status": "success", "deleted": 0})
        
        from datetime import datetime, timedelta
        cutoff = datetime.now() - timedelta(days=7)
        deleted = 0
        
        for f in os.listdir(logs_path):
            if f.endswith('.gz') or f.endswith('.log.gz'):
                fpath = os.path.join(logs_path, f)
                if datetime.fromtimestamp(os.path.getmtime(fpath)) < cutoff:
                    os.remove(fpath)
                    deleted += 1
        
        auth_mgr._log_audit(session["user"]["username"], "LOGS_CLEANUP", f"{name}: {deleted} fichiers")
        return jsonify({"status": "success", "deleted": deleted})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 22: Validation EULA automatique
@app.route("/api/server/<name>/eula/accept", methods=["POST"])
@login_required
def accept_eula(name):
    """Accepte l'EULA Minecraft"""
    try:
        eula_path = os.path.join(srv_mgr.base_dir, name, "eula.txt")
        with open(eula_path, "w") as f:
            f.write("# EULA acceptée automatiquement via MCPanel\neula=true\n")
        return jsonify({"status": "success", "message": "EULA acceptée"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 23: Infos détaillées du serveur
@app.route("/api/server/<name>/info/detailed")
@login_required
def server_detailed_info(name):
    """Informations détaillées sur le serveur"""
    try:
        srv_path = os.path.join(srv_mgr.base_dir, name)
        config = srv_mgr.get_server_config(name)
        props = srv_mgr.get_properties(name)
        plugins = plugin_mgr.list_installed(name)
        
        # Taille du serveur
        total_size = sum(
            os.path.getsize(os.path.join(dirpath, filename))
            for dirpath, dirnames, filenames in os.walk(srv_path)
            for filename in filenames
        ) if os.path.exists(srv_path) else 0
        
        # Taille du monde
        world_path = os.path.join(srv_path, "world")
        world_size = sum(
            os.path.getsize(os.path.join(dirpath, filename))
            for dirpath, dirnames, filenames in os.walk(world_path)
            for filename in filenames
        ) if os.path.exists(world_path) else 0
        
        return jsonify({
            "status": "success",
            "name": name,
            "config": config,
            "properties": props,
            "plugins_count": len(plugins),
            "size_mb": round(total_size / (1024**2), 2),
            "world_size_mb": round(world_size / (1024**2), 2)
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 24: Gestion des datapacks (simple)
@app.route("/api/server/<name>/datapacks/list")
@login_required
def list_datapacks_simple(name):
    """Liste les datapacks du serveur (version simple)"""
    try:
        datapacks_path = os.path.join(srv_mgr.base_dir, name, "world", "datapacks")
        datapacks = []
        
        if os.path.exists(datapacks_path):
            for item in os.listdir(datapacks_path):
                item_path = os.path.join(datapacks_path, item)
                if os.path.isdir(item_path) or item.endswith('.zip'):
                    datapacks.append({
                        "name": item,
                        "type": "folder" if os.path.isdir(item_path) else "zip"
                    })
        
        return jsonify({"status": "success", "datapacks": datapacks})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 25: Gestion des resourcepacks
@app.route("/api/server/<name>/resourcepack", methods=["GET", "POST"])
@login_required
def server_resourcepack(name):
    """Gère le resource pack du serveur"""
    if request.method == "POST":
        data = request.json or {}
        url = data.get("url", "")
        
        props = srv_mgr.get_properties(name)
        props["resource-pack"] = url
        props["resource-pack-prompt"] = data.get("prompt", "")
        srv_mgr.save_properties(name, props)
        
        return jsonify({"status": "success", "message": "Resource pack configuré"})
    
    props = srv_mgr.get_properties(name)
    return jsonify({
        "status": "success",
        "url": props.get("resource-pack", ""),
        "prompt": props.get("resource-pack-prompt", "")
    })


# Amélioration 26: Icône du serveur
@app.route("/api/server/<name>/icon", methods=["GET", "POST"])
@login_required
def server_icon(name):
    """Gère l'icône du serveur"""
    # Determine icon path using FileManager to be consistent
    try:
        server_dir = file_mgr._get_secure_path(name, "")
    except FileNotFoundError:
        server_dir = os.path.join(file_mgr.base_dir, name)
    icon_path = os.path.join(server_dir, "server-icon.png")
    
    if request.method == "POST":
        if 'icon' not in request.files:
            return jsonify({"status": "error", "message": "Aucune image envoyée"}), 400
        file = request.files['icon']
        try:
            logger.info(f"[ICON] Received upload for {name}: filename={file.filename}, content_type={file.content_type}")
        except Exception:
            pass

        if not file.filename.lower().endswith('.png'):
            return jsonify({"status": "error", "message": "L'image doit être un PNG"}), 400

        os.makedirs(os.path.dirname(icon_path), exist_ok=True)

        try:
            file.save(icon_path)
        except Exception as e:
            logger.error(f"[ERROR] saving icon for {name}: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

        try:
            if Image is not None:
                with Image.open(icon_path) as im:
                    if im.mode not in ('RGBA', 'RGB'):
                        im = im.convert('RGBA')
                    if im.size != (64, 64):
                        im = im.resize((64, 64), Image.LANCZOS)
                        im.save(icon_path, format='PNG')
            else:
                try:
                    logger.info(f"[ICON] Saved icon for {name}, size={os.path.getsize(icon_path)} bytes")
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"[ERROR] processing icon for {name}: {e}")
            return jsonify({"status": "error", "message": "Upload ok but traitement image a échoué: " + str(e)}), 500

        logger.info(f"[ICON] Uploaded icon for server {name} -> {icon_path}")
        return jsonify({"status": "success", "message": "Icône mise à jour", "path": icon_path})
    
    if os.path.exists(icon_path):
        return send_file(icon_path, mimetype='image/png')
    return jsonify({"status": "error", "message": "Pas d'icône"}), 404


# Amélioration 27: Configuration MOTD
@app.route("/api/server/<name>/motd", methods=["GET", "POST"])
@login_required
def server_motd(name):
    """Gère le MOTD du serveur"""
    if request.method == "POST":
        data = request.json or {}
        motd = data.get("motd", "A Minecraft Server")
        
        props = srv_mgr.get_properties(name)
        props["motd"] = motd
        srv_mgr.save_properties(name, props)
        
        return jsonify({"status": "success", "message": "MOTD mis à jour"})
    
    props = srv_mgr.get_properties(name)
    return jsonify({"status": "success", "motd": props.get("motd", "A Minecraft Server")})


# Amélioration 28: Mode maintenance
@app.route("/api/server/<name>/maintenance", methods=["GET", "POST"])
@login_required
def server_maintenance(name):
    """Gère le mode maintenance"""
    config = srv_mgr.get_server_config(name) or {}
    
    if request.method == "POST":
        data = request.json or {}
        config["maintenance"] = data.get("enabled", False)
        config["maintenance_message"] = data.get("message", "Serveur en maintenance")
        srv_mgr.save_server_config(name, config)
        
        return jsonify({"status": "success", "message": "Mode maintenance mis à jour"})
    
    return jsonify({
        "status": "success",
        "enabled": config.get("maintenance", False),
        "message": config.get("maintenance_message", "Serveur en maintenance")
    })


# Amélioration 29: Statistiques des joueurs
@app.route("/api/server/<name>/players/stats")
@login_required
def players_statistics(name):
    """Statistiques agrégées des joueurs"""
    try:
        players = stats_mgr.get_all_players(name)
        
        total_playtime = sum(p.get("playtime", 0) for p in players)
        total_deaths = sum(p.get("deaths", 0) for p in players)
        
        return jsonify({
            "status": "success",
            "total_players": len(players),
            "total_playtime_hours": round(total_playtime / 3600, 2),
            "total_deaths": total_deaths,
            "avg_playtime_hours": round(total_playtime / len(players) / 3600, 2) if players else 0
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 30: Export de configuration
@app.route("/api/server/<name>/config/export")
@login_required
def export_config(name):
    """Exporte la configuration du serveur"""
    try:
        config = srv_mgr.get_server_config(name)
        props = srv_mgr.get_properties(name)
        
        export_data = {
            "server_name": name,
            "exported_at": datetime.now().isoformat(),
            "config": config,
            "properties": props
        }
        
        from io import BytesIO
        buffer = BytesIO(json.dumps(export_data, indent=2).encode('utf-8'))
        buffer.seek(0)
        
        return send_file(buffer, as_attachment=True, 
                        download_name=f"{name}_config.json",
                        mimetype='application/json')
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 31: Import de configuration
@app.route("/api/server/<name>/config/import", methods=["POST"])
@login_required
def import_config(name):
    """Importe une configuration"""
    try:
        if 'config' not in request.files:
            data = request.json
        else:
            file = request.files['config']
            data = json.load(file)
        
        if data.get("config"):
            srv_mgr.save_server_config(name, data["config"])
        if data.get("properties"):
            srv_mgr.save_properties(name, data["properties"])
        
        auth_mgr._log_audit(session["user"]["username"], "CONFIG_IMPORT", name)
        return jsonify({"status": "success", "message": "Configuration importée"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 32: Gestion auto-restart
@app.route("/api/server/<name>/auto-restart", methods=["GET", "POST"])
@login_required
def auto_restart_config(name):
    """Configure l'auto-restart"""
    if request.method == "POST":
        data = request.json or {}
        server_monitor.set_auto_restart(
            name,
            enabled=data.get("enabled", True),
            max_restarts=data.get("max_restarts", 3)
        )
        return jsonify({"status": "success", "message": "Auto-restart configuré"})
    
    config = server_monitor.get_auto_restart_config(name)
    return jsonify({"status": "success", "config": config})


# Amélioration 33: Recherche de plugins Modrinth
@app.route("/api/plugins/modrinth/search")
@login_required
def search_modrinth():
    """Recherche des plugins sur Modrinth"""
    query = request.args.get("q", "")
    try:
        r = requests.get(
            "https://api.modrinth.com/v2/search",
            params={
                "query": query,
                "facets": '[[\"project_type:plugin\"]]',
                "limit": 20
            },
            headers={"User-Agent": "MCPanel/2.0"},
            timeout=15
        )
        if r.status_code == 200:
            return jsonify({"status": "success", "results": r.json().get("hits", [])})
        return jsonify({"status": "success", "results": []})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 34: Liste des backups avec détails
@app.route("/api/server/<name>/backups/detailed")
@login_required
def detailed_backups(name):
    """Liste des backups avec plus de détails"""
    try:
        backups = srv_mgr.list_backups(name)
        detailed = []
        
        for backup in backups:
            backup_path = os.path.join(srv_mgr.base_dir, name, "backups", backup.get("filename", ""))
            if os.path.exists(backup_path):
                size = os.path.getsize(backup_path)
                detailed.append({
                    **backup,
                    "size_mb": round(size / (1024**2), 2)
                })
        
        return jsonify({"status": "success", "backups": detailed})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 35: Restauration de backup
@app.route("/api/server/<name>/backup/<backup_name>/restore", methods=["POST"])
@admin_required
def restore_backup(name, backup_name):
    """Restaure un backup"""
    try:
        # Vérifier que le serveur est arrêté
        if name in srv_mgr.procs:
            return jsonify({"status": "error", "message": "Arrêtez le serveur avant la restauration"}), 400
        
        backup_path = os.path.join(srv_mgr.base_dir, name, "backups", backup_name)
        if not os.path.exists(backup_path):
            return jsonify({"status": "error", "message": "Backup non trouvé"}), 404
        
        import zipfile
        import shutil
        
        # Sauvegarder le monde actuel
        world_path = os.path.join(srv_mgr.base_dir, name, "world")
        if os.path.exists(world_path):
            shutil.rmtree(world_path)
        
        # Extraire le backup
        with zipfile.ZipFile(backup_path, 'r') as zip_ref:
            zip_ref.extractall(os.path.join(srv_mgr.base_dir, name))
        
        auth_mgr._log_audit(session["user"]["username"], "BACKUP_RESTORE", f"{name}: {backup_name}")
        return jsonify({"status": "success", "message": "Backup restauré"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 36: Suppression de backup (v2)
@app.route("/api/server/<name>/backup/<backup_name>/delete", methods=["POST"])
@login_required
def delete_backup_v2(name, backup_name):
    """Supprime un backup (version alternative)"""
    try:
        backup_path = os.path.join(srv_mgr.base_dir, name, "backups", backup_name)
        if os.path.exists(backup_path):
            os.remove(backup_path)
            auth_mgr._log_audit(session["user"]["username"], "BACKUP_DELETE", f"{name}: {backup_name}")
            return jsonify({"status": "success", "message": "Backup supprimé"})
        return jsonify({"status": "error", "message": "Backup non trouvé"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 37: Gestion des mondes multiples (détaillé)
@app.route("/api/server/<name>/worlds/detailed")
@login_required
def list_worlds_detailed(name):
    """Liste les mondes du serveur avec détails"""
    try:
        srv_path = os.path.join(srv_mgr.base_dir, name)
        worlds = []
        
        for item in os.listdir(srv_path):
            item_path = os.path.join(srv_path, item)
            if os.path.isdir(item_path):
                # Vérifier si c'est un monde Minecraft
                if os.path.exists(os.path.join(item_path, "level.dat")):
                    size = sum(
                        os.path.getsize(os.path.join(dirpath, filename))
                        for dirpath, dirnames, filenames in os.walk(item_path)
                        for filename in filenames
                    )
                    worlds.append({
                        "name": item,
                        "size_mb": round(size / (1024**2), 2)
                    })
        
        return jsonify({"status": "success", "worlds": worlds})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Amélioration 38: Gestion des seed
@app.route("/api/server/<name>/seed", methods=["GET", "POST"])
@login_required
def server_seed(name):
    """Gère le seed du serveur"""
    if request.method == "POST":
        data = request.json or {}
        seed = data.get("seed", "")
        
        props = srv_mgr.get_properties(name)
        props["level-seed"] = seed
        srv_mgr.save_properties(name, props)
        
        return jsonify({"status": "success", "message": "Seed mis à jour"})
    
    props = srv_mgr.get_properties(name)
    return jsonify({"status": "success", "seed": props.get("level-seed", "")})


# Amélioration 39: Mode debug
@app.route("/api/debug")
@admin_required
def debug_info():
    """Informations de debug"""
    import platform
    import psutil
    
    return jsonify({
        "status": "success",
        "python_version": sys.version,
        "flask_version": app.name,
        "platform": platform.platform(),
        "memory_process_mb": round(psutil.Process().memory_info().rss / (1024**2), 2),
        "active_threads": threading.active_count() if hasattr(threading, 'active_count') else 0,
        "servers_in_memory": list(srv_mgr.procs.keys())
    })


# Amélioration 40: Notifications websocket-like (SSE)
@app.route("/api/notifications/stream")
@login_required
def notifications_stream():
    """Stream de notifications en temps réel"""
    def generate_notifications():
        last_check = 0
        while True:
            try:
                # Vérifier les nouvelles alertes
                if hasattr(server_monitor, 'alerts'):
                    alerts = [a for a in server_monitor.alerts if not a.get('read')]
                    if alerts:
                        yield f"data: {json.dumps({'type': 'alert', 'data': alerts[0]})}\n\n"
                time.sleep(5)
            except GeneratorExit:
                break
    
    return Response(generate_notifications(), mimetype='text/event-stream')


# Amélioration 41-60: Fonctionnalités additionnelles diverses

@app.route("/api/server/<name>/jvm/flags")
@login_required
def get_jvm_flags(name):
    """Retourne les flags JVM recommandés"""
    config = srv_mgr.get_server_config(name) or {}
    ram_max = config.get("ram_max", "2048M")
    
    # Flags Aikar optimisés
    flags = [
        f"-Xms{ram_max}",
        f"-Xmx{ram_max}",
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1"
    ]
    
    return jsonify({"status": "success", "flags": flags, "combined": " ".join(flags)})


@app.route("/api/timezones")
@login_required
def list_timezones():
    """Liste les fuseaux horaires disponibles"""
    try:
        import pytz
        zones = list(pytz.common_timezones)
        return jsonify({"status": "success", "timezones": zones})
    except ImportError:
        return jsonify({"status": "success", "timezones": ["UTC", "Europe/Paris", "America/New_York"]})


@app.route("/api/server/<name>/whitelist/toggle", methods=["POST"])
@login_required
def toggle_whitelist(name):
    """Active/désactive la whitelist"""
    data = request.json or {}
    props = srv_mgr.get_properties(name)
    props["white-list"] = "true" if data.get("enabled", True) else "false"
    srv_mgr.save_properties(name, props)
    return jsonify({"status": "success", "enabled": data.get("enabled", True)})


@app.route("/api/server/<name>/pvp/toggle", methods=["POST"])
@login_required
def toggle_pvp(name):
    """Active/désactive le PvP"""
    data = request.json or {}
    props = srv_mgr.get_properties(name)
    props["pvp"] = "true" if data.get("enabled", True) else "false"
    srv_mgr.save_properties(name, props)
    return jsonify({"status": "success", "enabled": data.get("enabled", True)})


@app.route("/api/server/<name>/hardcore/toggle", methods=["POST"])
@login_required
def toggle_hardcore(name):
    """Active/désactive le mode hardcore"""
    data = request.json or {}
    props = srv_mgr.get_properties(name)
    props["hardcore"] = "true" if data.get("enabled", True) else "false"
    srv_mgr.save_properties(name, props)
    return jsonify({"status": "success", "enabled": data.get("enabled", True)})


@app.route("/api/server/<name>/flight/toggle", methods=["POST"])
@login_required
def toggle_flight(name):
    """Active/désactive le vol"""
    data = request.json or {}
    props = srv_mgr.get_properties(name)
    props["allow-flight"] = "true" if data.get("enabled", True) else "false"
    srv_mgr.save_properties(name, props)
    return jsonify({"status": "success", "enabled": data.get("enabled", True)})


@app.route("/api/server/<name>/commandblocks/toggle", methods=["POST"])
@login_required
def toggle_commandblocks(name):
    """Active/désactive les command blocks"""
    data = request.json or {}
    props = srv_mgr.get_properties(name)
    props["enable-command-block"] = "true" if data.get("enabled", True) else "false"
    srv_mgr.save_properties(name, props)
    return jsonify({"status": "success", "enabled": data.get("enabled", True)})


@app.route("/api/server/<name>/spawn-protection", methods=["GET", "POST"])
@login_required
def spawn_protection(name):
    """Gère la protection du spawn"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        props["spawn-protection"] = str(data.get("radius", 16))
        srv_mgr.save_properties(name, props)
        return jsonify({"status": "success", "radius": data.get("radius", 16)})
    
    return jsonify({"status": "success", "radius": int(props.get("spawn-protection", 16))})


@app.route("/api/server/<name>/max-players", methods=["GET", "POST"])
@login_required
def max_players_config(name):
    """Gère le nombre max de joueurs"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        props["max-players"] = str(data.get("max", 20))
        srv_mgr.save_properties(name, props)
        return jsonify({"status": "success", "max": data.get("max", 20)})
    
    return jsonify({"status": "success", "max": int(props.get("max-players", 20))})


@app.route("/api/server/<name>/view-distance", methods=["GET", "POST"])
@login_required
def view_distance_config(name):
    """Gère la distance de vue"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        props["view-distance"] = str(data.get("distance", 10))
        srv_mgr.save_properties(name, props)
        return jsonify({"status": "success", "distance": data.get("distance", 10)})
    
    return jsonify({"status": "success", "distance": int(props.get("view-distance", 10))})


@app.route("/api/server/<name>/simulation-distance", methods=["GET", "POST"])
@login_required
def simulation_distance_config(name):
    """Gère la distance de simulation"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        props["simulation-distance"] = str(data.get("distance", 10))
        srv_mgr.save_properties(name, props)
        return jsonify({"status": "success", "distance": data.get("distance", 10)})
    
    return jsonify({"status": "success", "distance": int(props.get("simulation-distance", 10))})


@app.route("/api/server/<name>/difficulty", methods=["GET", "POST"])
@login_required
def difficulty_config(name):
    """Gère la difficulté"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        difficulty = data.get("difficulty", "normal")
        if difficulty in ["peaceful", "easy", "normal", "hard"]:
            props["difficulty"] = difficulty
            srv_mgr.save_properties(name, props)
            return jsonify({"status": "success", "difficulty": difficulty})
        return jsonify({"status": "error", "message": "Difficulté invalide"}), 400
    
    return jsonify({"status": "success", "difficulty": props.get("difficulty", "normal")})


@app.route("/api/server/<name>/gamemode", methods=["GET", "POST"])
@login_required
def gamemode_config(name):
    """Gère le mode de jeu par défaut"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        gamemode = data.get("gamemode", "survival")
        if gamemode in ["survival", "creative", "adventure", "spectator"]:
            props["gamemode"] = gamemode
            srv_mgr.save_properties(name, props)
            return jsonify({"status": "success", "gamemode": gamemode})
        return jsonify({"status": "error", "message": "Mode de jeu invalide"}), 400
    
    return jsonify({"status": "success", "gamemode": props.get("gamemode", "survival")})


@app.route("/api/server/<name>/level-type", methods=["GET", "POST"])
@login_required
def level_type_config(name):
    """Gère le type de monde"""
    props = srv_mgr.get_properties(name)
    
    if request.method == "POST":
        data = request.json or {}
        level_type = data.get("type", "minecraft:normal")
        props["level-type"] = level_type
        srv_mgr.save_properties(name, props)
        return jsonify({"status": "success", "type": level_type})
    
    return jsonify({"status": "success", "type": props.get("level-type", "minecraft:normal")})


@app.route("/api/version")
def api_version():
    """Retourne la version de l'API"""
    return jsonify({
        "name": "MCPanel Pro",
        "version": "2.0.0",
        "api_version": "v1",
        "features": [
            "multi-server", "plugins", "backups", "monitoring",
            "notifications", "file-manager", "rcon", "tunnels"
        ]
    })


import threading
import json  # S'assurer que json est importé pour SSE

@app.route("/admin/governance")
@login_required
@admin_required
def admin_governance():
    return render_template("admin_governance.html")

if __name__ == "__main__":
    
    # Initialize HA Manager in background if Swarm is active
    try:
        from core.swarm_deployer import SwarmDeployer
        from core.ha_manager import HighAvailabilityManager
        
        # Simple check if config exists
        swarm_conf_path = 'data/swarm_config.json'
        if os.path.exists(swarm_conf_path):
             with open(swarm_conf_path) as f:
                 conf = json.load(f)
                 deployer = SwarmDeployer(conf)
                 if deployer.check_swarm_status().get('active'):
                     ha_mgr = HighAvailabilityManager(deployer)
                     ha_thread = threading.Thread(target=ha_mgr.monitor_loop, daemon=True)
                     ha_thread.start()
                     logger.info("[HA] High Availability Manager started.")
    except Exception as e:
        logger.warning(f"[HA] Error starting HA Manager: {e}")

    if not os.path.exists("servers"):
        os.makedirs("servers")
    
    java_ok = check_java()

    # Vérifier Docker et option d'installation automatique via CLI/ENV
    docker_ok = is_docker_installed()
    if not docker_ok and ("--install-docker" in sys.argv or os.getenv('AUTO_INSTALL_DOCKER', '0') == '1'):
        logger.info("[INFO] Docker non trouvé — tentative d'installation automatique demandée")
        try:
            res = install_docker_sync()
            docker_ok = bool(res.get('success'))
            if docker_ok:
                logger.info("[INFO] Docker installé avec succès")
            else:
                logger.warning(f"[WARN] Installation Docker échouée — voir log: {res.get('log')}")
        except Exception as e:
            logger.error(f"[ERROR] Erreur lors de l'installation automatique de Docker: {e}")

    import platform
    py_ver = platform.python_version()
    java_status = "OK \u2713" if java_ok else "MISSING \u2717"
    docker_status = "OK \u2713" if docker_ok else "MISSING \u2717"
    servers_dir = os.path.abspath("servers")
    if len(servers_dir) > 50:
        servers_dir = "..." + servers_dir[-47:]

    startup_msg = f"""
╔════════════════════════════════════════════════════════════════════════╗
║                         ⚡ MCPanel Pro ⚡                              ║
║                Minecraft Server Manager v0.2.6                         ║
╠════════════════════════════════════════════════════════════════════════╣
║  🐍 Python: {py_ver:<11} ☕ Java: {java_status:<11}  🐳 Docker: {docker_status:<11}   ║
║  📁 Serveurs: {servers_dir:<57}║
║  🌐 URL: http://127.0.0.1:5000                                         ║
╚════════════════════════════════════════════════════════════════════════╝
    """
    sys.stdout.write(startup_msg + "\n")
    logger.info("MCPanel started")
    
    try:
        app.run(debug=False, host="0.0.0.0", port=5000, threaded=True)
    except KeyboardInterrupt:
        logger.info("[INFO] Arrêt en cours...")
        try:
            for name in list(srv_mgr.procs.keys()):
                logger.info(f"[INFO] Arrêt du serveur: {name}")
                srv_mgr.stop(name)
            metrics_collector.stop()
            server_monitor.stop()
        except Exception: 
            pass
        logger.info("[INFO] MCPanel arrêté proprement.")
    except Exception as e:
        logger.critical(f"[FATAL] Erreur critique: {e}", exc_info=True)
        sys.exit(1)
