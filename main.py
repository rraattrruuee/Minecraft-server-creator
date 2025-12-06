import logging
import os
import secrets
import subprocess
import sys

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

from core.auth import AuthManager, admin_required, login_required
from core.i18n import i18n
from core.manager import ServerManager
from core.monitoring import MetricsCollector, ServerMonitor
from core.notifications import notification_manager, notify
from core.plugins import PluginManager
from core.rcon import RconClient
from core.scheduler import BackupScheduler
from core.stats import PlayerStatsManager
from core.playit import PlayitManager

# Configuration encodage pour Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass  # Python < 3.7

app = Flask(__name__, template_folder="app/templates", static_folder="app/static")
app.config['JSON_AS_ASCII'] = False  # Support caractères Unicode dans JSON
app.secret_key = secrets.token_hex(32)  # Clé secrète pour les sessions
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

# Initialiser le gestionnaire d'authentification
auth_mgr = AuthManager()

# Initialiser le monitoring
metrics_collector = MetricsCollector()
metrics_collector.start()

# Initialiser Playit.gg
playit_mgr = PlayitManager(os.path.join(os.path.dirname(__file__), "servers"))

print("[INFO] Demarrage MCPanel...")

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
            print(f"[INFO] Java detecte: {version_output}")
            return True
    except FileNotFoundError:
        print("[WARN] Java n'est pas installe ou pas dans le PATH")
        print("[WARN] Telechargez Java 17+ sur https://adoptium.net/")
        print("[WARN] Les serveurs ne pourront pas demarrer sans Java")
        return False
    except Exception as e:
        print(f"[WARN] Erreur verification Java: {e}")
        return False

# Initialiser les managers
srv_mgr = ServerManager()
stats_mgr = PlayerStatsManager(srv_mgr.base_dir)
plugin_mgr = PluginManager(srv_mgr.base_dir)
server_monitor = ServerMonitor(srv_mgr, metrics_collector)
server_monitor.start()
backup_scheduler = BackupScheduler(srv_mgr)


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
    data = request.json
    lang = data.get("lang", "fr")
    if i18n.set_language(lang):
        return jsonify({"status": "success", "lang": lang})
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
    
    user = auth_mgr.authenticate(username, password)
    if user:
        session["user"] = user
        return jsonify({"status": "success", "user": user})
    return jsonify({"status": "error", "message": "Identifiants incorrects"}), 401


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "Données manquantes"}), 400
    
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    if not username or not password:
        return jsonify({"status": "error", "message": "Nom d'utilisateur et mot de passe requis"}), 400
    
    if len(password) < 4:
        return jsonify({"status": "error", "message": "Le mot de passe doit contenir au moins 4 caractères"}), 400
    
    success, msg = auth_mgr.create_user(username, password, role="user")
    if success:
        # Auto-login après inscription
        user = auth_mgr.authenticate(username, password)
        if user:
            session["user"] = user
            return jsonify({"status": "success", "message": "Compte créé avec succès", "user": user})
    return jsonify({"status": "error", "message": msg}), 400


@app.route("/api/auth/user")
def api_current_user():
    if "user" in session:
        return jsonify({"status": "success", "user": session["user"]})
    return jsonify({"status": "error", "message": "Non connecté"}), 401


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


# ===================== ROUTES PRINCIPALES =====================

@app.route("/")
@login_required
def index():
    return render_template("index_pro.html")


@app.route("/api/papermc/versions")
@login_required
def get_versions():
    return jsonify(srv_mgr.get_available_versions())


@app.route("/api/servers")
@login_required
def list_servers():
    return jsonify(srv_mgr.list_servers())


@app.route("/api/forge/versions")
@login_required
def get_forge_versions():
    return jsonify({"status": "success", "versions": srv_mgr.get_forge_versions()})


@app.route("/api/fabric/versions")
@login_required
def get_fabric_versions():
    return jsonify({"status": "success", "versions": srv_mgr.get_fabric_versions()})


@app.route("/api/create", methods=["POST"])
@login_required
def create():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "error", "message": "Données manquantes"}), 400
        
        name = data.get("name", "").strip()
        version = data.get("version", "").strip()
        ram_min = data.get("ram_min", "1024M")
        ram_max = data.get("ram_max", "2048M")
        storage_limit = data.get("storage_limit")
        base_path = data.get("base_path", "").strip()
        server_type = data.get("server_type", "paper")
        loader_version = data.get("loader_version")
        
        if not name or not version:
            return jsonify({"status": "error", "message": "Nom et version requis"}), 400
        
        # Créer le serveur avec toutes les options
        srv_mgr.create_server(
            name=name, 
            version=version, 
            ram_min=ram_min,
            ram_max=ram_max,
            storage_limit=storage_limit,
            base_path=base_path if base_path else None,
            server_type=server_type,
            loader_version=loader_version
        )
        
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[ERROR] Erreur Creation: {e}")
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
        print(f"[ERROR] Erreur action {action}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/status")
@login_required
def status(name):
    return jsonify(srv_mgr.get_status(name))


@app.route("/api/server/<name>/logs")
@login_required
def logs(name):
    lines = request.args.get("lines", 100, type=int)
    filter_type = request.args.get("filter")
    search = request.args.get("search")
    return jsonify({"logs": srv_mgr.get_logs(name, lines, filter_type, search)})


@app.route("/api/server/<name>/logs/files")
@login_required
def logs_files(name):
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
        print(f"[ERROR] Erreur commande: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>", methods=["DELETE"])
@login_required
def delete(name):
    try:
        srv_mgr.delete_server(name)
        auth_mgr._log_audit(session["user"]["username"], "SERVER_DELETE", name)
        return jsonify({"status": "success", "message": "Serveur supprimé avec succès"})
    except Exception as e:
        print(f"[ERROR] Erreur suppression: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/config", methods=["GET", "POST"])
@login_required
def config(name):
    try:
        if request.method == "POST":
            srv_mgr.save_properties(name, request.json)
            return jsonify({"status": "success", "message": "Configuration sauvegardée"})
        return jsonify(srv_mgr.get_properties(name))
    except Exception as e:
        print(f"[ERROR] Erreur config: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/players")
@login_required
def players(name):
    return jsonify(stats_mgr.get_all_players(name))


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
        
        plugins_dir = os.path.join("servers", name, "plugins")
        os.makedirs(plugins_dir, exist_ok=True)
        
        filepath = os.path.join(plugins_dir, filename)
        file.save(filepath)
        
        auth_mgr._log_audit(session["user"]["username"], "PLUGIN_UPLOAD", f"{name}/{filename}")
        return jsonify({"status": "success", "message": f"Plugin {filename} installé"})
    except Exception as e:
        print(f"[ERROR] Erreur upload plugin: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/config", methods=["GET", "POST"])
@login_required
def server_config(name):
    if request.method == "POST":
        srv_mgr.save_server_config(name, request.json)
        return jsonify({"status": "success"})
    return jsonify(srv_mgr.get_server_config(name))


@app.route("/api/server/<name>/backup", methods=["POST"])
@login_required
def backup_server(name):
    try:
        result = srv_mgr.backup_server(name)
        auth_mgr._log_audit(session["user"]["username"], "BACKUP_CREATE", name)
        return jsonify({"status": "success", "backup": result, "message": "Sauvegarde créée"})
    except Exception as e:
        print(f"[ERROR] Erreur backup: {e}")
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
        print(f"[ERROR] Erreur suppression backup: {e}")
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


# ===================== FILE BROWSER =====================

@app.route("/api/server/<name>/files")
@login_required
def browse_files(name):
    path = request.args.get("path", "")
    items, error = srv_mgr.browse_files(name, path)
    if error:
        return jsonify({"status": "error", "message": error}), 400
    return jsonify({"status": "success", "files": items, "path": path})


@app.route("/api/server/<name>/files/read")
@login_required
def read_server_file(name):
    path = request.args.get("path", "")
    content, error = srv_mgr.read_file(name, path)
    if error:
        return jsonify({"status": "error", "message": error}), 400
    return jsonify({"status": "success", "content": content})


@app.route("/api/server/<name>/files/write", methods=["POST"])
@login_required
def write_server_file(name):
    data = request.json
    success, error = srv_mgr.write_file(name, data.get("path", ""), data.get("content", ""))
    if success:
        auth_mgr._log_audit(session["user"]["username"], "FILE_EDIT", f"{name}/{data.get('path')}")
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": error}), 400


@app.route("/api/server/<name>/files/upload", methods=["POST"])
@login_required
def upload_file(name):
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file"}), 400
    
    file = request.files['file']
    path = request.form.get('path', '')
    
    from werkzeug.utils import secure_filename
    filename = secure_filename(file.filename)
    
    server_dir = os.path.join("servers", name)
    target_dir = os.path.join(server_dir, path) if path else server_dir
    
    # Security check
    target_dir = os.path.normpath(target_dir)
    if not target_dir.startswith(os.path.normpath(server_dir)):
        return jsonify({"status": "error", "message": "Access denied"}), 403
    
    os.makedirs(target_dir, exist_ok=True)
    file.save(os.path.join(target_dir, filename))
    
    return jsonify({"status": "success", "message": f"Uploaded {filename}"})


# ===================== PORT MANAGEMENT =====================

@app.route("/api/ports/available")
@login_required
def get_available_port():
    start = request.args.get("start", 25565, type=int)
    port = srv_mgr.find_available_port(start)
    if port:
        return jsonify({"status": "success", "port": port})
    return jsonify({"status": "error", "message": "No port available"}), 500


# ===================== PLAYIT.GG =====================

@app.route("/api/playit/start", methods=["POST"])
@login_required
def playit_start():
    port = request.json.get("port", 25565) if request.json else 25565
    result = playit_mgr.start(port)
    return jsonify(result)

@app.route("/api/playit/stop", methods=["POST"])
@login_required
def playit_stop():
    result = playit_mgr.stop()
    return jsonify(result)

@app.route("/api/playit/status")
@login_required
def playit_status():
    return jsonify(playit_mgr.get_status())

@app.route("/api/playit/logs")
@login_required
def playit_logs():
    return jsonify({"logs": playit_mgr.get_logs()})


if __name__ == "__main__":
    if not os.path.exists("servers"):
        os.makedirs("servers")
    
    java_ok = check_java()
    
    print("=" * 50)
    print("MCPanel - Minecraft Server Manager")
    print("=" * 50)
    print(f"Python: {sys.version.split()[0]}")
    print(f"Java: {'OK' if java_ok else 'NOT FOUND'}")
    print(f"Servers: {os.path.abspath('servers')}")
    print("=" * 50)
    print("Running on http://127.0.0.1:5000")
    print("=" * 50)
    
    try:
        app.run(debug=False, host="0.0.0.0", port=5000, threaded=True)
    except KeyboardInterrupt:
        print("\nShutting down...")
        for name in list(srv_mgr.procs.keys()):
            srv_mgr.stop(name)
        print("Done.")
    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)
