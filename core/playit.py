import os
import subprocess
import threading
import time
import re
import requests
import zipfile
import shutil

class PlayitManager:
    def __init__(self, base_path):
        self.base_path = base_path
        self.playit_dir = os.path.join(base_path, "_playit")
        self.playit_exe = os.path.join(self.playit_dir, "playit.exe")
        self.process = None
        self.tunnel_address = None
        self.running = False
        self.output_lines = []
        self.claim_url = None
        
    def is_installed(self):
        return os.path.exists(self.playit_exe)
    
    def download(self):
        """Download playit.gg client"""
        os.makedirs(self.playit_dir, exist_ok=True)
        
        # Download latest Windows release
        download_url = "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe"
        
        try:
            response = requests.get(download_url, stream=True, timeout=60)
            response.raise_for_status()
            
            with open(self.playit_exe, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            return {"status": "success", "message": "Playit.gg installed"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def start(self, server_port=25565):
        """Start playit tunnel"""
        if self.running:
            return {"status": "error", "message": "Tunnel already running"}
        
        if not self.is_installed():
            result = self.download()
            if result["status"] == "error":
                return result
        
        try:
            # Start playit process
            self.process = subprocess.Popen(
                [self.playit_exe],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                cwd=self.playit_dir,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            
            self.running = True
            self.output_lines = []
            self.tunnel_address = None
            self.claim_url = None
            
            # Thread to read output
            thread = threading.Thread(target=self._read_output, daemon=True)
            thread.start()
            
            # Wait a bit for claim URL or tunnel address
            time.sleep(3)
            
            if self.claim_url:
                return {
                    "status": "claim_required",
                    "claim_url": self.claim_url,
                    "message": "Visit this URL to link your account"
                }
            elif self.tunnel_address:
                return {
                    "status": "success",
                    "address": self.tunnel_address,
                    "message": "Tunnel started"
                }
            else:
                return {
                    "status": "starting",
                    "message": "Tunnel is starting, check status in a few seconds"
                }
                
        except Exception as e:
            self.running = False
            return {"status": "error", "message": str(e)}
    
    def _read_output(self):
        """Read process output in background"""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if not self.running:
                    break
                    
                decoded = line.decode('utf-8', errors='ignore').strip()
                self.output_lines.append(decoded)
                
                # Keep only last 100 lines
                if len(self.output_lines) > 100:
                    self.output_lines = self.output_lines[-100:]
                
                # Look for claim URL
                if "claim" in decoded.lower() and "https://" in decoded:
                    match = re.search(r'(https://[^\s]+)', decoded)
                    if match:
                        self.claim_url = match.group(1)
                
                # Look for tunnel address patterns
                # Format: "allocated address: xxx.playit.gg:12345"
                # Or: "tunnel address xxx.at.playit.gg"
                if "playit.gg" in decoded or ".at.playit" in decoded:
                    match = re.search(r'([a-zA-Z0-9\-]+\.(?:at\.)?playit\.gg(?::\d+)?)', decoded)
                    if match:
                        self.tunnel_address = match.group(1)
                        
        except Exception:
            pass
        finally:
            self.running = False
    
    def stop(self):
        """Stop playit tunnel"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                self.process.kill()
            
            self.process = None
        
        self.running = False
        self.tunnel_address = None
        self.claim_url = None
        
        return {"status": "success", "message": "Tunnel stopped"}
    
    def get_status(self):
        """Get current tunnel status"""
        if not self.running:
            return {
                "status": "stopped",
                "running": False,
                "address": None
            }
        
        return {
            "status": "running" if self.tunnel_address else "connecting",
            "running": True,
            "address": self.tunnel_address,
            "claim_url": self.claim_url,
            "logs": self.output_lines[-20:] if self.output_lines else []
        }
    
    def get_logs(self):
        """Get tunnel logs"""
        return self.output_lines[-50:]
