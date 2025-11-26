import logging
import os
import sys

from flask import Flask, jsonify, render_template, request

from core.manager import ServerManager
from core.plugins import PluginManager
from core.stats import PlayerStatsManager

sys.stdout.reconfigure(encoding="utf-8")

app = Flask(__name__, template_folder="app/templates", static_folder="app/static")

log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

print("✅ Démarrage du Manager Ultimate...")

srv_mgr = ServerManager()
stats_mgr = PlayerStatsManager(srv_mgr.base_dir)
plugin_mgr = PluginManager(srv_mgr.base_dir)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/papermc/versions")
def get_versions():
    return jsonify(srv_mgr.get_available_versions())


@app.route("/api/servers")
def list_servers():
    return jsonify(srv_mgr.list_servers())


@app.route("/api/create", methods=["POST"])
def create():
    try:
        srv_mgr.create_server(request.json["name"], request.json["version"])
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"❌ Erreur Création: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/action", methods=["POST"])
def action(name):
    try:
        srv_mgr.action(name, request.json["action"])
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/server/<name>/status")
def status(name):
    return jsonify(srv_mgr.get_status(name))


@app.route("/api/server/<name>/console")
def console(name):
    return jsonify({"logs": srv_mgr.get_logs(name)})


@app.route("/api/server/<name>/command", methods=["POST"])
def command(name):
    srv_mgr.send_command(name, request.json["command"])
    return jsonify({"status": "success"})


@app.route("/api/server/<name>/delete", methods=["DELETE"])
def delete(name):
    srv_mgr.delete_server(name)
    return jsonify({"status": "success"})


@app.route("/api/server/<name>/properties", methods=["GET", "POST"])
def properties(name):
    if request.method == "POST":
        srv_mgr.save_properties(name, request.json)
        return jsonify({"status": "success"})
    return jsonify(srv_mgr.get_properties(name))


@app.route("/api/server/<name>/players")
def players(name):
    return jsonify(stats_mgr.get_all_players(name))


@app.route("/api/server/<name>/player/<uuid>")
def player_details(name, uuid):
    return jsonify(stats_mgr.get_player_details(name, uuid))


@app.route("/api/server/<name>/player/action", methods=["POST"])
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


@app.route("/api/hangar/search")
def search_plugins():
    return jsonify(plugin_mgr.search(request.args.get("q", "")))


@app.route("/api/server/<name>/plugins/install", methods=["POST"])
def install_plugin(name):
    d = request.json
    res = plugin_mgr.install(name, d["author"], d["slug"])
    if res["success"]:
        return jsonify(res)
    else:
        return jsonify(res), 500


if __name__ == "__main__":
    if not os.path.exists("servers"):
        os.makedirs("servers")
    print("🚀 Serveur Web lancé sur http://127.0.0.1:5000")
    app.run(debug=True, host="0.0.0.0", port=5000)
