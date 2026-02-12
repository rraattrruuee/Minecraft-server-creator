import os
import subprocess
import logging
import paramiko
from typing import Dict, List, Optional, Tuple, Union

class SwarmDeployer:
    def __init__(self, config: Dict):
        """
        Initialize the SwarmDeployer.
        
        :param config: Dictionary containing configuration:
                       - mode: 'local' or 'remote'
                       - ssh_host: Hostname or IP for remote mode
                       - ssh_user: Username for remote mode
                       - ssh_key_path: Path to private key for remote mode
                       - si_swarm_path: Path to si-swarm-deploy repository
                       - nfs_server_ip: IP of the NFS server (optional)
                       - nfs_path: Path on the NFS server (optional)
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.mode = config.get('mode', 'local')
        self.si_swarm_path = config.get('si_swarm_path', '../si-swarm-deploy')
        
    def _get_ssh_client(self):
        if self.mode != 'remote':
            return None
            
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        key_path = self.config.get('ssh_key_path')
        pkey = None
        if key_path and os.path.exists(key_path):
            pkey = paramiko.RSAKey.from_private_key_file(key_path)
            
        client.connect(
            hostname=self.config.get('ssh_host'),
            username=self.config.get('ssh_user'),
            pkey=pkey
        )
        return client

    def execute_command(self, command: str, cwd: str = None, env: Dict = None) -> Tuple[int, str, str]:
        """
        Execute a shell command locally or remotely.
        
        :return: (exit_code, stdout, stderr)
        """
        if self.mode == 'local':
            return self._execute_local(command, cwd, env)
        else:
            return self._execute_remote(command, cwd, env)

    def _execute_local(self, command: str, cwd: str = None, env: Dict = None) -> Tuple[int, str, str]:
        self.logger.info(f"Executing local command: {command} in {cwd}")
        
        # Merge environment variables
        current_env = os.environ.copy()
        if env:
            current_env.update(env)
            
        target_cwd = cwd if cwd else os.getcwd()
        if self.si_swarm_path and not os.path.isabs(self.si_swarm_path) and cwd is None:
             # Resolve relative path against current working directory if not absolute
             pass 

        try:
            process = subprocess.Popen(
                command,
                cwd=cwd,
                env=current_env,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate()
            return process.returncode, stdout, stderr
        except Exception as e:
            self.logger.error(f"Local execution failed: {e}")
            return -1, "", str(e)

    def _execute_remote(self, command: str, cwd: str = None, env: Dict = None) -> Tuple[int, str, str]:
        self.logger.info(f"Executing remote command: {command} in {cwd}")
        client = None
        try:
            client = self._get_ssh_client()
            
            # Build command with env vars and cwd
            env_prefix = ""
            if env:
                env_prefix = " ".join([f"export {k}='{v}';" for k, v in env.items()])
            
            cwd_cmd = f"cd {cwd} &&" if cwd else ""
            full_command = f"{cwd_cmd} {env_prefix} {command}"
            
            stdin, stdout, stderr = client.exec_command(full_command)
            exit_status = stdout.channel.recv_exit_status()
            out_str = stdout.read().decode('utf-8')
            err_str = stderr.read().decode('utf-8')
            
            return exit_status, out_str, err_str
            
        except Exception as e:
            self.logger.error(f"Remote execution failed: {e}")
            return -1, "", str(e)
        finally:
            if client:
                client.close()

    def create_secret(self, secret_name: str, secret_value: str) -> bool:
        """Create a Docker Swarm secret securely."""
        if self.mode == 'remote':
            # Note: passing secret in command line is insecure, should use pipe
            cmd = f"echo '{secret_value}' | docker secret create {secret_name} -"
            code, out, err = self.execute_command(cmd)
            return code == 0
        else:
            # Local
            try:
                p = subprocess.Popen(f"docker secret create {secret_name} -", shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                out, err = p.communicate(input=secret_value.encode())
                return p.returncode == 0
            except Exception as e:
                self.logger.error(f"Failed to create secret: {e}")
                return False

    def deploy_infrastructure(self, env_overrides: Dict[str, str] = None) -> Tuple[bool, str]:
        """
        Deploy the SI Swarm infrastructure using si-swarm-deploy scripts.
        """
        # Determine the absolute path to si-swarm-deploy
        if os.path.isabs(self.si_swarm_path):
            work_dir = self.si_swarm_path
        else:
            # Assuming relative to Minecraft-server-creator root if running from there
            work_dir = os.path.abspath(os.path.join(os.getcwd(), self.si_swarm_path))
            
        script_name = "deploy_stack.sh"
        
        # Generate .env file content or pass as env vars? 
        # The script reads .env file. So we might need to write it.
        # However, for remote execution, writing a file is trickier. 
        # si-swarm-deploy's executing script reads .env.
        # Let's try to export variables before running the script.
        
        env_vars = {
            "SI_DOMAIN": "minecraft.local",
            "SI_INTERNAL_DOMAIN": "internal.minecraft",
            # Add other defaults or overrides here
        }
        
        if env_overrides:
            env_vars.update(env_overrides)
            
        # For local, we can verify path
        if self.mode == 'local' and not os.path.exists(os.path.join(work_dir, script_name)):
            return False, f"Script not found at {os.path.join(work_dir, script_name)}"

        # The script uses sudo in instructions, but we run as is context permissions.
        # User might need to run the app with sudo or have docker permissions.
        
        exit_code, stdout, stderr = self.execute_command(
            f"bash {script_name}",
            cwd=work_dir,
            env=env_vars
        )
        
        if exit_code == 0:
            return True, stdout
        else:
            return False, f"STDOUT: {stdout}\nSTDERR: {stderr}"

    def check_swarm_status(self) -> Dict:
        """
        Check status of Docker Swarm.
        """
        code, out, err = self.execute_command("docker info --format '{{.Swarm.LocalNodeState}}'")
        is_active = "active" in out.lower()
        
        nodes = []
        if is_active:
            n_code, n_out, n_err = self.execute_command("docker node ls --format '{{.Hostname}}|{{.Status}}|{{.Role}}'")
            if n_code == 0:
                for line in n_out.strip().split('\n'):
                    if '|' in line:
                        host, status, role = line.split('|')
                        nodes.append({'hostname': host, 'status': status, 'role': role})
                        
        return {
            'active': is_active,
            'nodes': nodes,
            'raw_output': out
        }

