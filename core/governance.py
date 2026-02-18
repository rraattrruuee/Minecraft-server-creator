from functools import wraps
from flask import request, jsonify, session
import logging
from core.utils import parse_size_to_mb

logger = logging.getLogger(__name__)

class GovernanceManager:
    def __init__(self, quota_manager=None, server_manager=None):
        self.quota_mgr = quota_manager
        self.srv_mgr = server_manager

    def check_action_allowed(self, username: str, user_role: str, requested_resources: dict, exclude_server: str = None) -> dict:
        """
        Vérification centralisée si une action (création/modif) est autorisée.
        :param exclude_server: Nom du serveur à exclure du calcul (ex: lors d'une mise à jour de ressources)
        """
        if not self.quota_mgr or not self.srv_mgr:
            return {"allowed": True} # Fallback if not initialized
            
        current_usage = self.quota_mgr.get_current_usage(username, self.srv_mgr)
        
        # Si on modifie un serveur existant, on soustrait ses ressources actuelles du calcul
        if exclude_server:
            try:
                config = self.srv_mgr.get_server_config(exclude_server)
                current_usage["servers"] -= 1
                current_usage["memory_mb"] -= parse_size_to_mb(config.get("ram_max", "2048M"))
                current_usage["cpu_cores"] -= float(config.get("cpu_limit", 1.0) or 1.0)
            except Exception as e:
                logger.warning(f"Erreur lors de l'exclusion du serveur {exclude_server} pour quota: {e}")
                
        return self.quota_mgr.check_resource_availability(user_role, current_usage, requested_resources)

def enforce_governance(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
            
        # On pourrait ajouter ici des vérifications automatiques basées sur les paramètres de la requête
        # Mais on va plutôt laisser les routes appeler check_action_allowed explicitement pour plus de précision.
        return f(*args, **kwargs)
    return decorated_function
