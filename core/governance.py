from functools import wraps
from flask import request, jsonify, session

class GovernanceManager:
    def __init__(self):
        # Default limits
        self.DEFAULT_LIMITS = {
            'max_servers_per_user': 3,
            'max_ram_per_user_gb': 8,
            'allow_swarm_deploy': False
        }
        # Admin override
        self.ADMIN_LIMITS = {
            'max_servers_per_user': 100,
            'max_ram_per_user_gb': 128,
            'allow_swarm_deploy': True
        }

    def get_limits(self, user_role: str):
        if user_role == 'admin':
            return self.ADMIN_LIMITS
        return self.DEFAULT_LIMITS

    def check_server_creation_allowed(self, user_data: dict, current_server_count: int) -> bool:
        limits = self.get_limits(user_data.get('role', 'user'))
        if current_server_count >= limits['max_servers_per_user']:
            return False
        return True

    def check_resource_quota(self, user_data: dict, current_ram_usage_gb: float, requested_ram_gb: float) -> bool:
        limits = self.get_limits(user_data.get('role', 'user'))
        if (current_ram_usage_gb + requested_ram_gb) > limits['max_ram_per_user_gb']:
            return False
        return True

governance = GovernanceManager()

def enforce_governance(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Logic to check limits before allowing action
        # This is a placeholder for where middleware would reject requests
        # based on the GovernanceManager rules
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
            
        # Example check could go here
        return f(*args, **kwargs)
    return decorated_function
