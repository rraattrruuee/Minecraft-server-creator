from flask import Blueprint, redirect, render_template, request, jsonify, session, abort
from core.auth import login_required, admin_required
from core.docker_installer import is_docker_installed, install_docker_async
import subprocess
import os
import json
import logging

app_docker = Blueprint('docker_bp', __name__)
logger = logging.getLogger(__name__)

@app_docker.route('/docker-dashboard')
@login_required
def dashboard():
    # simply redirect into the SPA; data will be fetched client‑side if needed
    return redirect("/?section=docker-dashboard")

@app_docker.route('/api/docker/stats/<server_name>')
@login_required
def stats(server_name):
    # Security Check: Ensure user owns this server (via label or config)
    current_user = session.get("user", {}).get("username")
    is_admin = session.get("user", {}).get("role") == "admin"
    
    try:
        # Check ownership via docker inspect
        cmd_inspect = ["docker", "inspect", f"mc-{server_name}", "--format", '{{index .Config.Labels "com.mcpanel.owner"}}']
        res_inspect = subprocess.run(cmd_inspect, stdout=subprocess.PIPE, text=True)
        owner = res_inspect.stdout.strip()
        
        if not is_admin and owner != current_user:
             return jsonify({"error": "Forbidden"}), 403
             
        cmd = ["docker", "stats", f"mc-{server_name}", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}"]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
        out = res.stdout.strip()
        if not out: return jsonify({"error": "No stats"}), 404
        
        cpu, mem = out.split("|")
        return jsonify({
            "cpu": cpu,
            "memory": mem,
            "server": server_name
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app_docker.route('/api/docker/containers')
@login_required

def list_containers():
    user = session.get("user", {})
    role = user.get("role")
    username = user.get("username")
    containers = []
    if is_docker_installed():
        try:
            cmd = ["docker", "ps", "-a", "--filter", "label=com.mcpanel.server", "--format", "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}|{{.State}}|{{.Label \"com.mcpanel.owner\"}}"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
            for line in res.stdout.strip().splitlines():
                if not line:
                    continue
                parts = line.split("|")
                c_id = parts[0]
                c_name = parts[1].replace("mc-", "")
                c_status = parts[2]
                c_image = parts[3]
                c_state = parts[4]
                c_owner = parts[5] if len(parts) > 5 else "unknown"
                if role == "admin" or c_owner == username:
                    containers.append({
                        "id": c_id,
                        "name": c_name,
                        "status_text": c_status,
                        "image": c_image,
                        "state": c_state,
                        "owner": c_owner
                    })
        except Exception:
            pass
    return jsonify({"containers": containers})
