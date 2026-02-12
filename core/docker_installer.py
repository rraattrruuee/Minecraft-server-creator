"""core/docker_installer.py
Helpers to detect and (optionally) run the install scripts for Docker on supported OS.
This module only runs installer *scripts* included in the repo and writes logs under
`scripts/docker-install-logs/` so nothing is installed directly from Python code.
"""
import os
import platform
import subprocess
import threading
import time
from typing import Optional, Dict

ROOT = os.path.dirname(os.path.dirname(__file__))
SCRIPTS_DIR = os.path.join(ROOT, "scripts")
LOG_DIR = os.path.join(SCRIPTS_DIR, "docker-install-logs")
os.makedirs(LOG_DIR, exist_ok=True)


def is_docker_installed() -> bool:
    """Rapide détection de la présence de Docker (cli docker)."""
    try:
        subprocess.run(["docker", "--version"], capture_output=True, check=True, timeout=5)
        return True
    except Exception:
        return False


def _run_script(cmd: list, log_path: str, timeout: Optional[int] = None) -> Dict:
    """Exécute la commande `cmd` et redirige la sortie vers `log_path`.
    Retourne dict {success, returncode, log}.
    """
    with open(log_path, "a", encoding="utf-8", errors="ignore") as f:
        f.write(f"\n--- START: {' '.join(cmd)} ---\n")
        try:
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout)
            f.write(proc.stdout or "")
            success = proc.returncode == 0
            return {"success": success, "returncode": proc.returncode, "log": log_path}
        except subprocess.TimeoutExpired as e:
            f.write(str(e))
            return {"success": False, "returncode": -1, "log": log_path}
        except Exception as e:
            f.write(str(e))
            return {"success": False, "returncode": -2, "log": log_path}


def install_docker_sync() -> Dict:
    """Tente d'installer Docker en lançant le script adapté à la plateforme.
    Ne s'exécute que si l'utilisateur a les droits nécessaires (les scripts vérifient l'élévation).
    Retourne un dictionnaire avec le résultat et le chemin du log.
    """
    ts = time.strftime("%Y%m%d-%H%M%S")
    log_path = os.path.join(LOG_DIR, f"{ts}-install.log")

    system = platform.system().lower()
    if system == "linux":
        script = os.path.join(SCRIPTS_DIR, "install_docker_linux.sh")
        cmd = ["/bin/bash", script]
    elif system == "windows":
        script = os.path.join(SCRIPTS_DIR, "install_docker_windows.ps1")
        cmd = ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", script]
    else:
        return {"success": False, "returncode": -3, "log": log_path, "message": "OS non supporté"}

    return _run_script(cmd, log_path, timeout=1800)


def install_docker_async(callback=None) -> Dict:
    """Lance install_docker_sync() dans un thread et retourne immédiatement une structure
    contenant un `task_id` (timestamp) et le chemin du log. Si `callback` fourni, il sera
    appelé avec le résultat à la fin.
    """
    task_id = time.strftime("%Y%m%d-%H%M%S")
    log_path = os.path.join(LOG_DIR, f"{task_id}-install.log")

    def _worker():
        result = install_docker_sync()
        if callback:
            try:
                callback(result)
            except Exception:
                pass

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return {"task_id": task_id, "log": log_path, "status": "started"}
