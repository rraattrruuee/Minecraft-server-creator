from flask import Blueprint, redirect, render_template, request, jsonify, session
from core.auth import login_required, admin_required
from core.swarm_deployer import SwarmDeployer
from core.minecraft_swarm import MinecraftSwarmGenerator
import os
import json
import logging

swarm_bp = Blueprint('swarm', __name__, url_prefix='/swarm')
logger = logging.getLogger(__name__)

# Configuration storage (simplified for now, ideally in config_editor)
SWARM_CONFIG_FILE = 'data/swarm_config.json'

def get_swarm_config():
    if os.path.exists(SWARM_CONFIG_FILE):
        with open(SWARM_CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {
        'mode': 'local',
        'si_swarm_path': '../si-swarm-deploy',
        'ssh_host': '',
        'ssh_user': '',
        'ssh_key_path': '',
        'registry_domain': '',
        'nfs_server_ip': '',
        'nfs_path': '',
        # ...
    }

def save_swarm_config(config):
    os.makedirs(os.path.dirname(SWARM_CONFIG_FILE), exist_ok=True)
    with open(SWARM_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

@swarm_bp.route('/')
@login_required
@admin_required
def index():
    # redirect into the SPA; frontend can request swarm API data when section activated
    return redirect("/?section=swarm")

@swarm_bp.route('/save_config', methods=['POST'])
@login_required
@admin_required
def save_conf():
    data = request.json or {}
    # validation
    if data.get('mode') == 'remote':
        if not data.get('ssh_host') or not data.get('ssh_user'):
            return jsonify({'status': 'error', 'message': 'SSH host et user requis pour mode remote'}), 400
    save_swarm_config(data)
    return jsonify({'status': 'success', 'message': 'Configuration sauvegardée'})


@swarm_bp.route('/config', methods=['GET'])
@login_required
@admin_required
def get_conf():
    """Renvoie la configuration actuelle du Swarm"""
    return jsonify(get_swarm_config())

@swarm_bp.route('/deploy', methods=['POST'])
@login_required
@admin_required
def deploy_infra():
    config = get_swarm_config()
    deployer = SwarmDeployer(config)
    
    # Get overrides from request if any
    overrides = request.json.get('env_overrides', {})
    
    success, message = deployer.deploy_infrastructure(overrides)
    if success:
        return jsonify({'status': 'success', 'message': message})
    else:
        return jsonify({'status': 'error', 'message': message})

@swarm_bp.route('/status')
@login_required
@admin_required
def status():
    config = get_swarm_config()
    deployer = SwarmDeployer(config)
    return jsonify(deployer.check_swarm_status())

@swarm_bp.route('/nodes/token', methods=['GET'])
@login_required
@admin_required
def get_join_token():
    """Récupère le token pour ajouter un worker au swarm"""
    config = get_swarm_config()
    deployer = SwarmDeployer(config)
    # On suppose que le manager est le noeud courant ou celui configuré via SSH
    # Commande: docker swarm join-token worker -q
    code, out, err = deployer.execute_command("docker swarm join-token worker -q")
    if code != 0:
        return jsonify({'status': 'error', 'message': err})
    
    # Récupérer l'IP du manager
    # C'est un peu tricky à distance, on essaie de deviner ou on prend celle configurée
    manager_ip = config.get('ssh_host') or 'IP_DU_MANAGER'
    
    token = out.strip()
    command = f"docker swarm join --token {token} {manager_ip}:2377"
    
    return jsonify({'status': 'success', 'token': token, 'command': command})


@swarm_bp.route('/nodes/remove', methods=['POST'])
@login_required
@admin_required
def remove_node():
    data = request.json or {}
    hostname = data.get('hostname')
    if not hostname:
        return jsonify({'status': 'error', 'message': 'hostname manquant'}), 400
    deployer = SwarmDeployer(get_swarm_config())
    success, msg = deployer.remove_node(hostname)
    if success:
        return jsonify({'status': 'success', 'message': msg})
    else:
        return jsonify({'status': 'error', 'message': msg}), 500


@swarm_bp.route('/nodes/promote', methods=['POST'])
@login_required
@admin_required
def promote_node():
    data = request.json or {}
    hostname = data.get('hostname')
    if not hostname:
        return jsonify({'status': 'error', 'message': 'hostname manquant'}), 400
    deployer = SwarmDeployer(get_swarm_config())
    success, msg = deployer.promote_node(hostname)
    if success:
        return jsonify({'status': 'success', 'message': msg})
    else:
        return jsonify({'status': 'error', 'message': msg}), 500


@swarm_bp.route('/nodes/demote', methods=['POST'])
@login_required
@admin_required
def demote_node():
    data = request.json or {}
    hostname = data.get('hostname')
    if not hostname:
        return jsonify({'status': 'error', 'message': 'hostname manquant'}), 400
    deployer = SwarmDeployer(get_swarm_config())
    success, msg = deployer.demote_node(hostname)
    if success:
        return jsonify({'status': 'success', 'message': msg})
    else:
        return jsonify({'status': 'error', 'message': msg}), 500


@swarm_bp.route('/generate_stack', methods=['POST'])
@login_required
@admin_required
def generate_stack():
    """Generate a Minecraft stack file for testing or deployment"""
    data = request.json
    config = get_swarm_config()
    
    gen = MinecraftSwarmGenerator(
        registry_url=f"{config.get('registry_domain', 'registry.lab')}",
        nfs_server=config.get('nfs_server_ip'),
        nfs_path=config.get('nfs_path')
    )
    
    stack = gen.generate_stack_config(
        server_name=data.get('name'),
        server_port=data.get('port', 25565),
        memory=data.get('memory', '2G'),
        server_type=data.get('type', 'PAPER'),
        version=data.get('version', 'latest')
    )
    
    return jsonify({'status': 'success', 'stack': stack})

