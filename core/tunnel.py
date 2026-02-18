"""
Tunnel Manager - Alternatives gratuites pour Minecraft
Supporte: playit.gg (recommandé), ngrok, bore, serveo, localhost.run
100% gratuit, aucune inscription requise pour la plupart
"""

import os
import subprocess
import threading
import time
import re
import socket
import json
import shutil
import platform
import requests
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import logging

# Configuration du logging
logger = logging.getLogger(__name__)


class TunnelProvider(Enum):
    """Providers de tunnel disponibles"""
    PLAYIT = "playit"  # playit.gg - Meilleur pour Minecraft, gratuit
    NGROK = "ngrok"  # ngrok - TCP tunnel gratuit
    BORE = "bore"  # Rust, gratuit, sans compte
    SERVEO = "serveo"  # SSH, gratuit, sans compte (peut être instable)
    LOCALHOST_RUN = "localhost.run"  # SSH, gratuit, sans compte
    CLOUDFLARED = "cloudflared"  # Cloudflare, gratuit avec compte
    MANUAL_PORT = "manual"  # Port forwarding manuel


@dataclass
class TunnelConfig:
    """Configuration du tunnel"""
    provider: TunnelProvider = TunnelProvider.PLAYIT
    local_port: int = 25565
    protocol: str = "tcp"  # tcp ou http
    custom_domain: Optional[str] = None
    auto_reconnect: bool = True
    max_retries: int = 5
    retry_delay: int = 5
    playit_secret: Optional[str] = None  # Secret key pour playit.gg
    ngrok_authtoken: Optional[str] = None  # Token optionnel pour ngrok


@dataclass
class TunnelStatus:
    """État du tunnel"""
    running: bool = False
    provider: Optional[str] = None
    address: Optional[str] = None
    port: Optional[int] = None
    full_address: Optional[str] = None
    started_at: Optional[datetime] = None
    error: Optional[str] = None
    retries: int = 0
    logs: List[str] = field(default_factory=list)


class TunnelManager:
    """
    Gestionnaire de tunnel unifié supportant plusieurs providers gratuits
    """
    
    def __init__(self, base_path: str):
        self.base_path = base_path
        self.tunnel_dir = os.path.join(base_path, "_tunnel")
        os.makedirs(self.tunnel_dir, exist_ok=True)
        
        self.process: Optional[subprocess.Popen] = None
        self.status = TunnelStatus()
        self.config = TunnelConfig()
        self._output_thread: Optional[threading.Thread] = None
        self._reconnect_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        
        # Charger la config sauvegardée
        self._load_config()
    
    def _load_config(self):
        """Charge la configuration sauvegardée"""
        config_path = os.path.join(self.tunnel_dir, "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    data = json.load(f)
                    self.config.provider = TunnelProvider(data.get('provider', 'playit'))
                    self.config.local_port = data.get('local_port', 25565)
                    self.config.auto_reconnect = data.get('auto_reconnect', True)
                    self.config.playit_secret = data.get('playit_secret')
                    self.config.ngrok_authtoken = data.get('ngrok_authtoken')
            except Exception as e:
                logger.warning(f"Erreur chargement config tunnel: {e}")
    
    def _save_config(self):
        """Sauvegarde la configuration"""
        config_path = os.path.join(self.tunnel_dir, "config.json")
        try:
            config_data = {
                'provider': self.config.provider.value,
                'local_port': self.config.local_port,
                'auto_reconnect': self.config.auto_reconnect
            }
            if self.config.playit_secret:
                config_data['playit_secret'] = self.config.playit_secret
            if self.config.ngrok_authtoken:
                config_data['ngrok_authtoken'] = self.config.ngrok_authtoken
            
            with open(config_path, 'w') as f:
                json.dump(config_data, f, indent=2)
        except Exception as e:
            logger.warning(f"Erreur sauvegarde config tunnel: {e}")
    
    def _log(self, message: str):
        """Ajoute un message aux logs"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        with self._lock:
            self.status.logs.append(log_entry)
            if len(self.status.logs) > 100:
                self.status.logs = self.status.logs[-100:]
        logger.info(message)
    
    def get_available_providers(self) -> List[Dict[str, Any]]:
        """Retourne la liste des providers disponibles"""
        providers = [
            {
                "id": TunnelProvider.PLAYIT.value,
                "name": "playit.gg",
                "description": "Meilleur pour Minecraft - Gratuit, fiable, aucun port à ouvrir",
                "requires_install": True,
                "supports_tcp": True,
                "supports_minecraft": True,
                "status": "recommended",
                "setup_url": "https://playit.gg/download"
            },
            {
                "id": TunnelProvider.NGROK.value,
                "name": "ngrok",
                "description": "Tunnel TCP gratuit, fiable, sans compte requis",
                "requires_install": True,
                "supports_tcp": True,
                "supports_minecraft": True,
                "status": "recommended"
            },
            {
                "id": TunnelProvider.BORE.value,
                "name": "Bore",
                "description": "Tunnel TCP léger en Rust, gratuit, sans compte",
                "requires_install": True,
                "supports_tcp": True,
                "supports_minecraft": True,
                "status": "available"
            },
            {
                "id": TunnelProvider.SERVEO.value,
                "name": "Serveo",
                "description": "Tunnel SSH gratuit (peut être temporairement indisponible)",
                "requires_install": False,
                "supports_tcp": True,
                "supports_minecraft": True,
                "status": "available"
            },
            {
                "id": TunnelProvider.LOCALHOST_RUN.value,
                "name": "localhost.run",
                "description": "Tunnel SSH pour HTTP (limité pour Minecraft)",
                "requires_install": False,
                "supports_tcp": False,
                "supports_minecraft": False,
                "status": "limited"
            },
            {
                "id": TunnelProvider.CLOUDFLARED.value,
                "name": "Cloudflare Tunnel",
                "description": "Tunnel Cloudflare, compte gratuit requis",
                "requires_install": True,
                "supports_tcp": True,
                "supports_minecraft": True,
                "status": "available"
            },
            {
                "id": TunnelProvider.MANUAL_PORT.value,
                "name": "Port Manuel",
                "description": "Utilisez votre propre redirection de port",
                "requires_install": False,
                "supports_tcp": True,
                "supports_minecraft": True,
                "status": "available"
            }
        ]
        
        # Vérifier les installations
        if self._check_playit_installed():
            for p in providers:
                if p["id"] == "playit":
                    p["installed"] = True
        
        if self._check_ngrok_installed():
            for p in providers:
                if p["id"] == "ngrok":
                    p["installed"] = True
        
        if self._check_bore_installed():
            for p in providers:
                if p["id"] == "bore":
                    p["installed"] = True
        
        # Vérifier SSH disponible
        ssh_available = self._check_ssh_available()
        for p in providers:
            if p["id"] in ["localhost.run", "serveo"] and not ssh_available:
                p["status"] = "ssh_required"
        
        return providers
    
    def _check_ssh_available(self) -> bool:
        """Vérifie si SSH est disponible"""
        try:
            result = subprocess.run(
                ["ssh", "-V"],
                capture_output=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            return True
        except:
            return False
    
    def _check_playit_installed(self) -> bool:
        """Vérifie si playit est installé"""
        # Vérifier dans le dossier tunnel
        playit_name = "playit.exe" if platform.system() == "Windows" else "playit"
        local_path = os.path.join(self.tunnel_dir, playit_name)
        if os.path.exists(local_path):
            return True
        # Vérifier dans PATH
        return shutil.which("playit") is not None
    
    def _check_ngrok_installed(self) -> bool:
        """Vérifie si ngrok est installé"""
        ngrok_name = "ngrok.exe" if platform.system() == "Windows" else "ngrok"
        local_path = os.path.join(self.tunnel_dir, ngrok_name)
        if os.path.exists(local_path):
            return True
        return shutil.which("ngrok") is not None
    
    def _check_bore_installed(self) -> bool:
        """Vérifie si bore est installé"""
        bore_path = os.path.join(self.tunnel_dir, "bore.exe" if platform.system() == "Windows" else "bore")
        return os.path.exists(bore_path)
    
    def _get_playit_path(self) -> Optional[str]:
        """Trouve l'exécutable playit"""
        playit_name = "playit.exe" if platform.system() == "Windows" else "playit"
        local_path = os.path.join(self.tunnel_dir, playit_name)
        if os.path.exists(local_path):
            return local_path
        system_path = shutil.which("playit")
        if system_path:
            return system_path
        return None
    
    def _get_ngrok_path(self) -> Optional[str]:
        """Trouve l'exécutable ngrok"""
        ngrok_name = "ngrok.exe" if platform.system() == "Windows" else "ngrok"
        local_path = os.path.join(self.tunnel_dir, ngrok_name)
        if os.path.exists(local_path):
            return local_path
        system_path = shutil.which("ngrok")
        if system_path:
            return system_path
        return None
    
    def _install_playit(self) -> bool:
        """Télécharge et installe playit"""
        self._log("Installation de playit.gg...")
        
        system = platform.system().lower()
        machine = platform.machine().lower()
        
        # Déterminer l'architecture
        if machine in ("x86_64", "amd64"):
            arch = "amd64"
        elif machine in ("aarch64", "arm64"):
            arch = "aarch64"
        elif machine.startswith("armv7"):
            arch = "armv7"
        else:
            arch = "amd64"
        
        # URL de téléchargement
        version = "0.16.5"
        if system == "windows":
            url = f"https://github.com/playit-cloud/playit-agent/releases/download/v{version}/playit-windows-x86_64-signed.exe"
            dest_name = "playit.exe"
        elif system == "linux":
            url = f"https://github.com/playit-cloud/playit-agent/releases/download/v{version}/playit-linux-{arch}"
            dest_name = "playit"
        elif system == "darwin":
            url = f"https://github.com/playit-cloud/playit-agent/releases/download/v{version}/playit-darwin-{arch}"
            dest_name = "playit"
        else:
            self._log(f"Système non supporté: {system}")
            return False
        
        dest_path = os.path.join(self.tunnel_dir, dest_name)
        
        try:
            self._log(f"Téléchargement depuis: {url}")
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            
            with open(dest_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # Rendre exécutable sur Linux/Mac
            if system != "windows":
                os.chmod(dest_path, 0o755)
            
            self._log("playit.gg installé avec succès!")
            return True
        except Exception as e:
            self._log(f"Erreur installation playit: {e}")
            return False
    
    def _install_ngrok(self) -> bool:
        """Télécharge et installe ngrok"""
        self._log("Installation de ngrok...")
        
        system = platform.system().lower()
        machine = platform.machine().lower()
        
        # Déterminer l'architecture
        if machine in ("x86_64", "amd64"):
            arch = "amd64"
        elif machine in ("aarch64", "arm64"):
            arch = "arm64"
        elif machine in ("i386", "i686"):
            arch = "386"
        else:
            arch = "amd64"
        
        # URL de téléchargement
        if system == "windows":
            url = f"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-{arch}.zip"
            archive_ext = "zip"
        elif system == "linux":
            url = f"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-{arch}.tgz"
            archive_ext = "tgz"
        elif system == "darwin":
            url = f"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-{arch}.zip"
            archive_ext = "zip"
        else:
            self._log(f"Système non supporté: {system}")
            return False
        
        archive_path = os.path.join(self.tunnel_dir, f"ngrok.{archive_ext}")
        
        try:
            self._log(f"Téléchargement de ngrok...")
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            
            with open(archive_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # Extraire
            if archive_ext == "zip":
                import zipfile
                with zipfile.ZipFile(archive_path, 'r') as z:
                    z.extractall(self.tunnel_dir)
            else:
                import tarfile
                with tarfile.open(archive_path, 'r:gz') as t:
                    t.extractall(self.tunnel_dir)
            
            os.remove(archive_path)
            
            # Rendre exécutable
            ngrok_path = os.path.join(self.tunnel_dir, "ngrok.exe" if system == "windows" else "ngrok")
            if system != "windows" and os.path.exists(ngrok_path):
                os.chmod(ngrok_path, 0o755)
            
            self._log("ngrok installé avec succès!")
            return True
        except Exception as e:
            self._log(f"Erreur installation ngrok: {e}")
            if os.path.exists(archive_path):
                os.remove(archive_path)
            return False
    
    def _install_bore(self) -> bool:
        """Télécharge et installe bore"""
        self._log("Installation de bore...")
        
        system = platform.system().lower()
        arch = "x86_64" if platform.machine().endswith('64') else "i686"
        
        if system == "windows":
            filename = f"bore-v0.5.1-{arch}-pc-windows-msvc.zip"
            exe_name = "bore.exe"
        elif system == "linux":
            filename = f"bore-v0.5.1-{arch}-unknown-linux-musl.tar.gz"
            exe_name = "bore"
        elif system == "darwin":
            filename = f"bore-v0.5.1-{arch}-apple-darwin.tar.gz"
            exe_name = "bore"
        else:
            self._log(f"Système non supporté: {system}")
            return False
        
        url = f"https://github.com/ekzhang/bore/releases/download/v0.5.1/{filename}"
        
        try:
            response = requests.get(url, stream=True, timeout=60)
            response.raise_for_status()
            
            archive_path = os.path.join(self.tunnel_dir, filename)
            with open(archive_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # Extraire
            if filename.endswith('.zip'):
                import zipfile
                with zipfile.ZipFile(archive_path, 'r') as z:
                    z.extractall(self.tunnel_dir)
            else:
                import tarfile
                with tarfile.open(archive_path, 'r:gz') as t:
                    t.extractall(self.tunnel_dir)
            
            os.remove(archive_path)
            self._log("Bore installé avec succès")
            return True
            
        except Exception as e:
            self._log(f"Erreur installation bore: {e}")
            return False
    
    def start(self, provider: Optional[str] = None, port: int = 25565, secret_key: Optional[str] = None) -> Dict[str, Any]:
        """Démarre le tunnel"""
        with self._lock:
            if self.status.running:
                return {"status": "error", "message": "Tunnel déjà en cours"}
        
        self.config.local_port = port
        if secret_key:
            self.config.playit_secret = secret_key
        if provider:
            try:
                self.config.provider = TunnelProvider(provider)
            except ValueError:
                return {"status": "error", "message": f"Provider inconnu: {provider}"}
        
        self._save_config()
        self._stop_event.clear()
        
        # Démarrer selon le provider
        try:
            if self.config.provider == TunnelProvider.PLAYIT:
                return self._start_playit()
            elif self.config.provider == TunnelProvider.NGROK:
                return self._start_ngrok()
            elif self.config.provider == TunnelProvider.BORE:
                return self._start_bore()
            elif self.config.provider == TunnelProvider.SERVEO:
                return self._start_serveo()
            elif self.config.provider == TunnelProvider.LOCALHOST_RUN:
                return self._start_localhost_run()
            elif self.config.provider == TunnelProvider.CLOUDFLARED:
                return self._start_cloudflared()
            elif self.config.provider == TunnelProvider.MANUAL_PORT:
                return self._start_manual()
            else:
                return {"status": "error", "message": "Provider non supporté"}
        except Exception as e:
            self._log(f"Erreur démarrage tunnel: {e}")
            return {"status": "error", "message": str(e)}
    
    def _start_playit(self) -> Dict[str, Any]:
        """Démarre un tunnel via playit.gg - Recommandé pour Minecraft"""
        self._log("Démarrage tunnel playit.gg...")
        
        playit_path = self._get_playit_path()
        if not playit_path:
            if not self._install_playit():
                return {
                    "status": "error", 
                    "message": "Impossible d'installer playit.gg. Téléchargez-le manuellement sur https://playit.gg/download"
                }
            playit_path = self._get_playit_path()
        
        if not playit_path:
            return {"status": "error", "message": "playit.gg non trouvé après installation"}
        
        try:
            # Construire la commande
            cmd = [playit_path]
            
            # Si on a une secret key configurée
            if self.config.playit_secret:
                cmd.extend(["--secret", self.config.playit_secret])
            
            self._log(f"Commande: {' '.join(cmd)}")
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                cwd=self.tunnel_dir,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            
            self.status.running = True
            self.status.provider = "playit.gg"
            self.status.started_at = datetime.now()
            
            # Thread de lecture
            self._output_thread = threading.Thread(
                target=self._read_output_playit,
                daemon=True
            )
            self._output_thread.start()
            
            # Attendre l'adresse (playit peut prendre un peu plus de temps)
            for _ in range(20):
                if self.status.address:
                    break
                time.sleep(1)
            
            if self.status.address:
                return {
                    "status": "success",
                    "address": self.status.full_address,
                    "provider": "playit.gg",
                    "message": "Tunnel playit.gg démarré! Adresse prête pour Minecraft."
                }
            else:
                return {
                    "status": "starting",
                    "provider": "playit.gg",
                    "message": "Tunnel en cours de connexion... Visitez https://playit.gg pour configurer votre tunnel si c'est la première fois.",
                    "setup_url": "https://playit.gg"
                }
                
        except Exception as e:
            self.status.running = False
            return {"status": "error", "message": str(e)}
    
    def _read_output_playit(self):
        """Lit la sortie de playit.gg"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if self._stop_event.is_set():
                    break
                
                decoded = line.decode('utf-8', errors='ignore').strip()
                if decoded:
                    self._log(decoded)
                
                # Chercher l'adresse du tunnel
                # playit affiche souvent: "tunnel address: xxx.ply.gg:12345"
                # ou "Minecraft Java: xxx.ply.gg:12345"
                patterns = [
                    r'([a-z0-9\-]+\.(?:ply\.gg|gl\.joinmc\.link|auto\.playit\.gg)[:\d]*)',
                    r'Minecraft[^:]*:\s*([^\s]+:\d+)',
                    r'tunnel[^:]*:\s*([^\s]+:\d+)',
                    r'address[^:]*:\s*([^\s]+:\d+)',
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, decoded, re.IGNORECASE)
                    if match:
                        addr = match.group(1)
                        if ':' in addr:
                            self.status.address = addr
                            self.status.full_address = addr
                            host, port = addr.rsplit(':', 1)
                            try:
                                self.status.port = int(port)
                            except:
                                pass
                            self._log(f"✓ Tunnel playit.gg actif: {addr}")
                            break
                        
        except Exception as e:
            self._log(f"Erreur lecture playit: {e}")
        finally:
            if self.config.auto_reconnect and not self._stop_event.is_set():
                self._schedule_reconnect()
    
    def _start_ngrok(self) -> Dict[str, Any]:
        """Démarre un tunnel via ngrok - TCP gratuit"""
        self._log("Démarrage tunnel ngrok...")
        
        ngrok_path = self._get_ngrok_path()
        if not ngrok_path:
            if not self._install_ngrok():
                return {
                    "status": "error",
                    "message": "Impossible d'installer ngrok. Téléchargez-le sur https://ngrok.com/download"
                }
            ngrok_path = self._get_ngrok_path()
        
        if not ngrok_path:
            return {"status": "error", "message": "ngrok non trouvé après installation"}
        
        try:
            # ngrok tcp PORT
            cmd = [ngrok_path, "tcp", str(self.config.local_port), "--log", "stdout"]
            
            self._log(f"Commande: {' '.join(cmd)}")
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=self.tunnel_dir,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            
            self.status.running = True
            self.status.provider = "ngrok"
            self.status.started_at = datetime.now()
            
            # Thread de lecture
            self._output_thread = threading.Thread(
                target=self._read_output_ngrok,
                daemon=True
            )
            self._output_thread.start()
            
            # Attendre l'adresse
            for _ in range(15):
                if self.status.address:
                    break
                time.sleep(1)
            
            # Si pas d'adresse via stdout, essayer l'API ngrok locale
            if not self.status.address:
                self._try_ngrok_api()
            
            if self.status.address:
                return {
                    "status": "success",
                    "address": self.status.full_address,
                    "provider": "ngrok",
                    "message": "Tunnel ngrok démarré!"
                }
            else:
                return {
                    "status": "starting",
                    "provider": "ngrok",
                    "message": "Tunnel en cours de connexion..."
                }
                
        except Exception as e:
            self.status.running = False
            return {"status": "error", "message": str(e)}
    
    def _read_output_ngrok(self):
        """Lit la sortie de ngrok"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if self._stop_event.is_set():
                    break
                
                decoded = line.decode('utf-8', errors='ignore').strip()
                if decoded:
                    self._log(decoded)
                
                # Chercher l'URL ngrok
                # Format: url=tcp://X.tcp.ngrok.io:PORT
                match = re.search(r'url=tcp://([^":\s]+:\d+)', decoded)
                if match:
                    addr = match.group(1)
                    self.status.address = addr
                    self.status.full_address = addr
                    try:
                        host, port = addr.rsplit(':', 1)
                        self.status.port = int(port)
                    except:
                        pass
                    self._log(f"✓ Tunnel ngrok actif: {addr}")
                        
        except Exception as e:
            self._log(f"Erreur lecture ngrok: {e}")
        finally:
            if self.config.auto_reconnect and not self._stop_event.is_set():
                self._schedule_reconnect()
    
    def _try_ngrok_api(self):
        """Essaie de récupérer l'adresse via l'API locale ngrok"""
        try:
            time.sleep(2)  # Laisser le temps à ngrok de démarrer son API
            r = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
            if r.status_code == 200:
                data = r.json()
                tunnels = data.get("tunnels", [])
                for tunnel in tunnels:
                    public_url = tunnel.get("public_url", "")
                    if public_url.startswith("tcp://"):
                        addr = public_url.replace("tcp://", "")
                        self.status.address = addr
                        self.status.full_address = addr
                        try:
                            host, port = addr.rsplit(':', 1)
                            self.status.port = int(port)
                        except:
                            pass
                        self._log(f"✓ Tunnel ngrok (API): {addr}")
                        break
        except Exception as e:
            self._log(f"Impossible de récupérer l'adresse ngrok via API: {e}")

    def _start_localhost_run(self) -> Dict[str, Any]:
        """Démarre un tunnel via localhost.run (SSH) - Limité pour Minecraft (HTTP only)"""
        self._log("Démarrage tunnel localhost.run...")
        self._log("⚠️ Note: localhost.run est principalement HTTP, peut ne pas fonctionner pour Minecraft TCP")
        
        if not self._check_ssh_available():
            return {"status": "error", "message": "SSH non disponible. Installez OpenSSH."}
        
        try:
            # Commande SSH pour localhost.run (TCP)
            cmd = [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=30",
                "-o", "ServerAliveCountMax=3",
                "-o", "ExitOnForwardFailure=yes",
                "-R", f"80:localhost:{self.config.local_port}",
                "nokey@localhost.run"
            ]
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            
            self.status.running = True
            self.status.provider = "localhost.run"
            self.status.started_at = datetime.now()
            
            # Thread de lecture
            self._output_thread = threading.Thread(
                target=self._read_output_localhost_run,
                daemon=True
            )
            self._output_thread.start()
            
            # Attendre l'adresse
            for _ in range(10):
                if self.status.address:
                    break
                time.sleep(1)
            
            if self.status.address:
                return {
                    "status": "success",
                    "address": self.status.full_address,
                    "provider": "localhost.run",
                    "message": "Tunnel démarré"
                }
            else:
                return {
                    "status": "starting",
                    "provider": "localhost.run",
                    "message": "Tunnel en cours de connexion..."
                }
                
        except Exception as e:
            self.status.running = False
            return {"status": "error", "message": str(e)}
    
    def _read_output_localhost_run(self):
        """Lit la sortie de localhost.run"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if self._stop_event.is_set():
                    break
                
                decoded = line.decode('utf-8', errors='ignore').strip()
                self._log(decoded)
                
                # Chercher l'URL
                # Format: "Connect to https://xxxxx.lhr.life"
                if "https://" in decoded and ".lhr.life" in decoded:
                    match = re.search(r'(https://[a-z0-9]+\.lhr\.life)', decoded)
                    if match:
                        url = match.group(1)
                        self.status.address = url.replace("https://", "")
                        self.status.full_address = url
                        self._log(f"Tunnel actif: {url}")
                        
        except Exception as e:
            self._log(f"Erreur lecture: {e}")
        finally:
            if self.config.auto_reconnect and not self._stop_event.is_set():
                self._schedule_reconnect()
    
    def _start_serveo(self) -> Dict[str, Any]:
        """Démarre un tunnel via Serveo (SSH)"""
        self._log("Démarrage tunnel Serveo...")
        
        if not self._check_ssh_available():
            return {"status": "error", "message": "SSH non disponible"}
        
        try:
            cmd = [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=30",
                "-R", f"0:localhost:{self.config.local_port}",
                "serveo.net"
            ]
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            
            self.status.running = True
            self.status.provider = "serveo"
            self.status.started_at = datetime.now()
            
            self._output_thread = threading.Thread(
                target=self._read_output_serveo,
                daemon=True
            )
            self._output_thread.start()
            
            for _ in range(10):
                if self.status.address:
                    break
                time.sleep(1)
            
            if self.status.address:
                return {
                    "status": "success",
                    "address": self.status.full_address,
                    "provider": "serveo",
                    "message": "Tunnel démarré"
                }
            else:
                return {
                    "status": "starting",
                    "provider": "serveo",
                    "message": "Tunnel en cours de connexion..."
                }
                
        except Exception as e:
            self.status.running = False
            return {"status": "error", "message": str(e)}
    
    def _read_output_serveo(self):
        """Lit la sortie de Serveo"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if self._stop_event.is_set():
                    break
                
                decoded = line.decode('utf-8', errors='ignore').strip()
                self._log(decoded)
                
                # Format: "Forwarding TCP connections from serveo.net:PORT"
                match = re.search(r'serveo\.net:(\d+)', decoded)
                if match:
                    port = match.group(1)
                    self.status.address = f"serveo.net:{port}"
                    self.status.full_address = f"serveo.net:{port}"
                    self.status.port = int(port)
                    self._log(f"Tunnel actif: serveo.net:{port}")
                    
        except Exception as e:
            self._log(f"Erreur lecture: {e}")
        finally:
            if self.config.auto_reconnect and not self._stop_event.is_set():
                self._schedule_reconnect()
    
    def _start_bore(self) -> Dict[str, Any]:
        """Démarre un tunnel via bore"""
        self._log("Démarrage tunnel bore...")
        
        if not self._check_bore_installed():
            if not self._install_bore():
                return {"status": "error", "message": "Impossible d'installer bore"}
        
        bore_path = os.path.join(
            self.tunnel_dir, 
            "bore.exe" if platform.system() == "Windows" else "bore"
        )
        
        try:
            # bore local PORT --to bore.pub
            cmd = [bore_path, "local", str(self.config.local_port), "--to", "bore.pub"]
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=self.tunnel_dir,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            
            self.status.running = True
            self.status.provider = "bore"
            self.status.started_at = datetime.now()
            
            self._output_thread = threading.Thread(
                target=self._read_output_bore,
                daemon=True
            )
            self._output_thread.start()
            
            for _ in range(10):
                if self.status.address:
                    break
                time.sleep(1)
            
            if self.status.address:
                return {
                    "status": "success",
                    "address": self.status.full_address,
                    "provider": "bore",
                    "message": "Tunnel démarré"
                }
            else:
                return {
                    "status": "starting",
                    "provider": "bore",
                    "message": "Tunnel en cours de connexion..."
                }
                
        except Exception as e:
            self.status.running = False
            return {"status": "error", "message": str(e)}
    
    def _read_output_bore(self):
        """Lit la sortie de bore"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if self._stop_event.is_set():
                    break
                
                decoded = line.decode('utf-8', errors='ignore').strip()
                self._log(decoded)
                
                # Format: "listening at bore.pub:PORT"
                match = re.search(r'bore\.pub:(\d+)', decoded)
                if match:
                    port = match.group(1)
                    self.status.address = f"bore.pub:{port}"
                    self.status.full_address = f"bore.pub:{port}"
                    self.status.port = int(port)
                    self._log(f"Tunnel actif: bore.pub:{port}")
                    
        except Exception as e:
            self._log(f"Erreur lecture: {e}")
        finally:
            if self.config.auto_reconnect and not self._stop_event.is_set():
                self._schedule_reconnect()
    
    def _start_cloudflared(self) -> Dict[str, Any]:
        """Démarre un tunnel Cloudflare (quick tunnel, pas de compte)"""
        self._log("Démarrage tunnel Cloudflare...")
        
        cloudflared_path = self._get_cloudflared_path()
        if not cloudflared_path:
            if not self._install_cloudflared():
                return {"status": "error", "message": "Impossible d'installer cloudflared"}
            cloudflared_path = self._get_cloudflared_path()
        
        try:
            # Quick tunnel sans compte
            cmd = [cloudflared_path, "tunnel", "--url", f"tcp://localhost:{self.config.local_port}"]
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
            )
            
            self.status.running = True
            self.status.provider = "cloudflared"
            self.status.started_at = datetime.now()
            
            self._output_thread = threading.Thread(
                target=self._read_output_cloudflared,
                daemon=True
            )
            self._output_thread.start()
            
            for _ in range(15):
                if self.status.address:
                    break
                time.sleep(1)
            
            if self.status.address:
                return {
                    "status": "success",
                    "address": self.status.full_address,
                    "provider": "cloudflared",
                    "message": "Tunnel démarré"
                }
            else:
                return {
                    "status": "starting",
                    "provider": "cloudflared",
                    "message": "Tunnel en cours de connexion..."
                }
                
        except Exception as e:
            self.status.running = False
            return {"status": "error", "message": str(e)}
    
    def _get_cloudflared_path(self) -> Optional[str]:
        """Trouve cloudflared"""
        # Vérifier dans le dossier tunnel
        local_path = os.path.join(
            self.tunnel_dir,
            "cloudflared.exe" if platform.system() == "Windows" else "cloudflared"
        )
        if os.path.exists(local_path):
            return local_path
        
        # Vérifier dans PATH
        if shutil.which("cloudflared"):
            return "cloudflared"
        
        return None
    
    def _install_cloudflared(self) -> bool:
        """Installe cloudflared"""
        self._log("Installation de cloudflared...")
        
        system = platform.system().lower()
        
        if system == "windows":
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
            path = os.path.join(self.tunnel_dir, "cloudflared.exe")
        elif system == "linux":
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
            path = os.path.join(self.tunnel_dir, "cloudflared")
        elif system == "darwin":
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
            path = os.path.join(self.tunnel_dir, "cloudflared")
        else:
            return False
        
        try:
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            
            with open(path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            if system != "windows":
                os.chmod(path, 0o755)
            
            self._log("Cloudflared installé")
            return True
        except Exception as e:
            self._log(f"Erreur installation cloudflared: {e}")
            return False
    
    def _read_output_cloudflared(self):
        """Lit la sortie de cloudflared"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if self._stop_event.is_set():
                    break
                
                decoded = line.decode('utf-8', errors='ignore').strip()
                self._log(decoded)
                
                # Format: "https://xxx-xxx-xxx.trycloudflare.com"
                match = re.search(r'(https://[a-z0-9\-]+\.trycloudflare\.com)', decoded)
                if match:
                    url = match.group(1)
                    self.status.address = url.replace("https://", "")
                    self.status.full_address = url
                    self._log(f"Tunnel actif: {url}")
                    
        except Exception as e:
            self._log(f"Erreur lecture: {e}")
        finally:
            if self.config.auto_reconnect and not self._stop_event.is_set():
                self._schedule_reconnect()
    
    def _start_manual(self) -> Dict[str, Any]:
        """Mode port forwarding manuel"""
        self._log("Mode port forwarding manuel activé")
        
        # Obtenir l'IP locale
        local_ip = self._get_local_ip()
        
        self.status.running = True
        self.status.provider = "manual"
        self.status.address = f"{local_ip}:{self.config.local_port}"
        self.status.full_address = f"{local_ip}:{self.config.local_port}"
        self.status.started_at = datetime.now()
        
        return {
            "status": "success",
            "address": self.status.full_address,
            "provider": "manual",
            "message": "Configurez la redirection de port sur votre routeur",
            "instructions": [
                f"1. Accédez à l'interface de votre routeur (généralement 192.168.1.1)",
                f"2. Cherchez 'Port Forwarding' ou 'NAT'",
                f"3. Ajoutez une règle: Port externe {self.config.local_port} → {local_ip}:{self.config.local_port}",
                f"4. Trouvez votre IP publique sur whatismyip.com",
                f"5. Partagez: VOTRE_IP_PUBLIQUE:{self.config.local_port}"
            ]
        }
    
    def _get_local_ip(self) -> str:
        """Obtient l'IP locale"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"
    
    def _schedule_reconnect(self):
        """Planifie une reconnexion automatique"""
        if self.status.retries >= self.config.max_retries:
            self._log("Nombre maximum de tentatives atteint")
            self.status.running = False
            return
        
        self.status.retries += 1
        delay = self.config.retry_delay * self.status.retries
        self._log(f"Reconnexion dans {delay}s (tentative {self.status.retries}/{self.config.max_retries})")
        
        def reconnect():
            time.sleep(delay)
            if not self._stop_event.is_set():
                self._log("Tentative de reconnexion...")
                self.start(self.config.provider.value, self.config.local_port)
        
        self._reconnect_thread = threading.Thread(target=reconnect, daemon=True)
        self._reconnect_thread.start()
    
    def stop(self) -> Dict[str, Any]:
        """Arrête le tunnel"""
        self._log("Arrêt du tunnel...")
        self._stop_event.set()
        
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass
            self.process = None
        
        self.status = TunnelStatus()
        self._log("Tunnel arrêté")
        
        return {"status": "success", "message": "Tunnel arrêté"}
    
    def get_status(self) -> Dict[str, Any]:
        """Retourne l'état du tunnel"""
        uptime = None
        if self.status.started_at:
            uptime = int((datetime.now() - self.status.started_at).total_seconds())
        
        return {
            "running": self.status.running,
            "provider": self.status.provider,
            "address": self.status.full_address,
            "port": self.status.port,
            "uptime": uptime,
            "retries": self.status.retries,
            "error": self.status.error,
            "logs": self.status.logs[-20:],
            "status": "running" if self.status.running and self.status.address else 
                     "connecting" if self.status.running else "stopped"
        }
    
    def get_logs(self) -> List[str]:
        """Retourne les logs"""
        return self.status.logs[-50:]
    
    def test_connection(self) -> Dict[str, Any]:
        """Teste si le port local est accessible"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex(('localhost', self.config.local_port))
            sock.close()
            
            if result == 0:
                return {
                    "status": "success",
                    "message": f"Port {self.config.local_port} accessible"
                }
            else:
                return {
                    "status": "error", 
                    "message": f"Port {self.config.local_port} non accessible. Le serveur Minecraft est-il démarré?"
                }
        except Exception as e:
            return {"status": "error", "message": str(e)}


# Instance globale pour compatibilité
_tunnel_manager: Optional[TunnelManager] = None

def get_tunnel_manager(base_path: str) -> TunnelManager:
    """Retourne l'instance du gestionnaire de tunnel"""
    global _tunnel_manager
    if _tunnel_manager is None:
        _tunnel_manager = TunnelManager(base_path)
    return _tunnel_manager
