import sys
import os
import time
import requests
import signal
import logging
import webbrowser
import subprocess

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='[Launcher] %(message)s')
logger = logging.getLogger("Launcher")

FLASK_URL = "http://127.0.0.1:5000"

def is_headless():
    """Détecte si l'environnement est headless (serveur sans écran)."""
    if os.environ.get("MCPANEL_HEADLESS") == "1":
        return True
    
    if sys.platform.startswith('linux'):
        display = os.environ.get('DISPLAY')
        wayland = os.environ.get('WAYLAND_DISPLAY')
        if not display and not wayland:
            return True
    return False

def check_server_ready():
    """Attend que le serveur Flask soit prêt."""
    max_retries = 30
    for i in range(max_retries):
        try:
            requests.get(FLASK_URL, timeout=1)
            logger.info("Serveur backend détecté et prêt.")
            return True
        except requests.ConnectionError:
            time.sleep(0.5)
            if i % 5 == 0:
                logger.debug("En attente du backend...")
    return False

def run_flask_app():
    """Lance l'application dans Docker (préféré) ou en local."""
    
    # 1. Essayer Docker Compose
    if os.path.exists("docker-compose.yml") and "no-docker" not in sys.argv:
        try:
            subprocess.run(["docker-compose", "version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            logger.info("Docker Compose détecté. Démarrage du conteneur...")
            subprocess.run(["docker-compose", "up", "-d", "--build"], check=True)
            return "dockered"
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("Docker Compose non disponible ou erreur. Fallback sur exécution locale.")

    # 2. Lancement local (Python)
    logger.info("Démarrage du serveur Flask en local...")
    python_cmd = sys.executable
    server_script = os.path.join(os.path.dirname(__file__), "main.py")
    
    # Passer l'env actuel
    env = os.environ.copy()
    proc = subprocess.Popen([python_cmd, server_script], env=env)
    return proc

def launch_gui():
    """Ouvre l'interface dans le navigateur par défaut."""
    logger.info(f"Ouverture du navigateur sur {FLASK_URL}")
    webbrowser.open(FLASK_URL)

def main():
    """Point d'entrée principal."""
    logger.info("Initialisation du Minecraft Server Creator Launcher...")
    
    global backend_process
    backend_process = None

    def signal_handler(sig, frame):
        logger.info("Signal d'arrêt reçu. Fermeture...")
        if backend_process and hasattr(backend_process, 'terminate'):
             backend_process.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Lancer le backend
    backend = run_flask_app()
    if isinstance(backend, str):
        # dockered
        backend_process = None 
    else:
        # Popen object
        backend_process = backend

    # Vérifier l'environnement graphique
    if is_headless():
        logger.info("Environnement serveur détecté: Lancement en mode CLI/Web seulement.")
        if backend == "dockered":
             logger.info("Docker container running.")
        else:
             logger.info(f"Interface accessible sur: {FLASK_URL}")
        
        logger.info("Appuyez sur Ctrl+C pour arrêter.")
        
        try:
            if backend_process:
                backend_process.wait()
            else:
                while True: time.sleep(1)
        except KeyboardInterrupt:
            signal_handler(None, None)

    else:
        logger.info("Environnement de bureau détecté: Lancement de l'interface native.")
        
        if check_server_ready():
            launch_gui()
            try:
                if backend_process:
                    backend_process.wait()
                else:
                    while True: time.sleep(1)
            except KeyboardInterrupt:
                pass
        else:
            logger.error("Le backend n'a pas démarré correctement.")
            if backend_process:
                backend_process.terminate()

if __name__ == "__main__":
    main()
