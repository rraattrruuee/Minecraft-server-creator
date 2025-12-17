import json
import os
import psutil
import threading
import time
from collections import deque
from datetime import datetime

# Import notification system
try:
    from core.notifications import notify
except:
    def notify(*args, **kwargs): pass


class MetricsCollector:
    def __init__(self, max_history=300):  # 5 minutes à 1 mesure/seconde
        self.max_history = max_history
        self.system_metrics = deque(maxlen=max_history)
        self.server_metrics = {}  # {server_name: deque}
        self._running = False
        self._thread = None
        self._lock = threading.Lock()
        
    def start(self):
        """Démarre la collecte en arrière-plan"""
        if self._running:
            return
        self._running = True
        try:
            self._collect_system()
        except Exception:
            pass
        self._thread = threading.Thread(target=self._collect_loop, daemon=True)
        self._thread.start()
        print("[METRICS] Collecteur de métriques démarré")
    
    def stop(self):
        """Arrête la collecte"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
    
    def _collect_loop(self):
        """Boucle de collecte"""
        while self._running:
            try:
                self._collect_system()
            except Exception as e:
                print(f"[METRICS] Erreur collecte: {e}")
            time.sleep(1)  # Collecte toutes les secondes
    
    def _collect_system(self):
        """Collecte les métriques système"""
        with self._lock:
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            
            self.system_metrics.append({
                "timestamp": datetime.now().isoformat(),
                "cpu": cpu,
                "ram_used": round(mem.used / (1024**3), 2),  # GB
                "ram_total": round(mem.total / (1024**3), 2),
                "ram_percent": mem.percent,
                "disk_used": round(disk.used / (1024**3), 2),
                "disk_total": round(disk.total / (1024**3), 2),
                "disk_percent": round(disk.percent, 1)
            })
    
    def update_server_metrics(self, server_name, data):
        """Met à jour les métriques d'un serveur"""
        with self._lock:
            if server_name not in self.server_metrics:
                self.server_metrics[server_name] = deque(maxlen=self.max_history)
            
            self.server_metrics[server_name].append({
                "timestamp": datetime.now().isoformat(),
                **data
            })
    
    def get_system_metrics(self, limit=60):
        """Récupère les dernières métriques système"""
        with self._lock:
            data = list(self.system_metrics)
            return data[-limit:] if len(data) > limit else data
    
    def get_current_system(self):
        """Récupère les métriques système actuelles.

        Pour garantir l'exactitude et la cohérence avec l'historique, on retourne
        la dernière entrée collectée par la boucle `_collect_system` si elle est
        disponible. Cela évite les mesures ponctuelles qui peuvent diverger
        (ex: différents intervalles d'échantillonnage ou blocage par `psutil`).
        """
        with self._lock:
            if len(self.system_metrics) > 0:
                last = self.system_metrics[-1]
                return {
                    "timestamp": last.get("timestamp", datetime.now().isoformat()),
                    "cpu": {
                        "percent": last.get("cpu", 0),
                        "cores": psutil.cpu_count(),
                        "cores_physical": psutil.cpu_count(logical=False)
                    },
                    "memory": {
                        "used_gb": last.get("ram_used", 0),
                        "total_gb": last.get("ram_total", 0),
                        "available_gb": round((psutil.virtual_memory().available) / (1024**3), 2),
                        "percent": last.get("ram_percent", 0)
                    },
                    "disk": {
                        "used_gb": last.get("disk_used", 0),
                        "total_gb": last.get("disk_total", 0),
                        "free_gb": round((psutil.disk_usage('/').free) / (1024**3), 2),
                        "percent": last.get("disk_percent", 0)
                    },
                    "process": {
                        "memory_mb": round(psutil.Process().memory_info().rss / (1024**2), 2),
                        "cpu_percent": psutil.Process().cpu_percent()
                    }
                }

        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        process = psutil.Process()
        return {
            "timestamp": datetime.now().isoformat(),
            "cpu": {
                "percent": cpu,
                "cores": psutil.cpu_count(),
                "cores_physical": psutil.cpu_count(logical=False)
            },
            "memory": {
                "used_gb": round(mem.used / (1024**3), 2),
                "total_gb": round(mem.total / (1024**3), 2),
                "available_gb": round(mem.available / (1024**3), 2),
                "percent": mem.percent
            },
            "disk": {
                "used_gb": round(disk.used / (1024**3), 2),
                "total_gb": round(disk.total / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "percent": round(disk.percent, 1)
            },
            "process": {
                "memory_mb": round(process.memory_info().rss / (1024**2), 2),
                "cpu_percent": process.cpu_percent()
            }
        }
    
    def get_server_metrics(self, server_name, limit=60):
        """Récupère les métriques d'un serveur"""
        with self._lock:
            if server_name not in self.server_metrics:
                return []
            data = list(self.server_metrics[server_name])
            return data[-limit:] if len(data) > limit else data


class ServerMonitor:
    """Moniteur de santé des serveurs Minecraft"""
    
    def __init__(self, server_manager, metrics_collector):
        self.srv_mgr = server_manager
        self.metrics = metrics_collector
        self._running = False
        self._thread = None
        self.alerts = deque(maxlen=100)
        
        # Auto-restart settings
        self.auto_restart = {}  # {server_name: {"enabled": bool, "max_restarts": int, "count": int, "last_crash": timestamp}}
        self.restart_cooldown = 60  # seconds between restart attempts
        
        # Configuration alertes
        self.alert_thresholds = {
            "cpu_percent": 90,
            "ram_percent": 90,
            "disk_percent": 95,
            "tps_min": 15 
        }
    
    def set_auto_restart(self, server_name, enabled=True, max_restarts=3):
        """Configure auto-restart for a server"""
        self.auto_restart[server_name] = {
            "enabled": enabled,
            "max_restarts": max_restarts,
            "count": 0,
            "last_crash": 0
        }
    
    def get_auto_restart_config(self, server_name):
        return self.auto_restart.get(server_name, {"enabled": False, "max_restarts": 3})
    
    def reset_restart_count(self, server_name):
        """Reset crash counter (call when server starts successfully)"""
        if server_name in self.auto_restart:
            self.auto_restart[server_name]["count"] = 0
    
    def start(self):
        """Démarre le monitoring"""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        print("[MONITOR] Surveillance des serveurs démarrée")
    
    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
    
    def _monitor_loop(self):
        """Boucle de monitoring"""
        while self._running:
            try:
                self._check_servers()
                self._check_system_health()
            except Exception as e:
                print(f"[MONITOR] Erreur: {e}")
            time.sleep(5)  # Check toutes les 5 secondes
    
    def _check_servers(self):
        """Vérifie l'état de chaque serveur"""
        for name, proc in list(self.srv_mgr.procs.items()):
            try:
                if proc.poll() is not None:
                    # Serveur crashé
                    self._add_alert("crash", name, f"Le serveur {name} a crashé!")
                    del self.srv_mgr.procs[name]
                    
                    # Auto-restart logic
                    config = self.auto_restart.get(name, {})
                    if config.get("enabled"):
                        now = time.time()
                        last_crash = config.get("last_crash", 0)
                        
                        # Reset counter if it's been a while since last crash
                        if now - last_crash > 600:  # 10 minutes
                            config["count"] = 0
                        
                        if config["count"] < config.get("max_restarts", 3):
                            if now - last_crash > self.restart_cooldown:
                                config["count"] += 1
                                config["last_crash"] = now
                                print(f"[MONITOR] Auto-restart {name} (attempt {config['count']})")
                                try:
                                    self.srv_mgr.start(name)
                                    self._add_alert("restart", name, f"Auto-restart {name} (#{config['count']})")
                                except Exception as e:
                                    print(f"[MONITOR] Failed to restart {name}: {e}")
                        else:
                            self._add_alert("crash", name, f"{name}: max restarts reached, manual intervention needed")
            except:
                pass
    
    def _check_system_health(self):
        """Vérifie la santé système"""
        current = self.metrics.get_current_system()
        
        if current["cpu"]["percent"] > self.alert_thresholds["cpu_percent"]:
            self._add_alert("cpu", "system", f"CPU élevé: {current['cpu']['percent']}%")
        
        if current["memory"]["percent"] > self.alert_thresholds["ram_percent"]:
            self._add_alert("memory", "system", f"RAM élevée: {current['memory']['percent']}%")
        
        if current["disk"]["percent"] > self.alert_thresholds["disk_percent"]:
            self._add_alert("disk", "system", f"Disque plein: {current['disk']['percent']}%")
    
    def _add_alert(self, alert_type, source, message):
        """Ajoute une alerte et envoie notification"""
        alert = {
            "timestamp": datetime.now().isoformat(),
            "type": alert_type,
            "source": source,
            "message": message,
            "read": False
        }
        self.alerts.appendleft(alert)
        print(f"[ALERT] [{alert_type.upper()}] {message}")
        
        # Send to Discord/Email via notification system
        severity = "error" if alert_type in ["crash", "disk"] else "warning"
        title = {
            "crash": "Server Crash",
            "restart": "Auto Restart",
            "cpu": "High CPU",
            "memory": "High Memory",
            "disk": "Disk Full"
        }.get(alert_type, "Alert")
        
        notify(
            event_type="alert" if alert_type != "crash" else "crash",
            title=title,
            message=message,
            server=source if source != "system" else None,
            severity=severity
        )
    
    def get_alerts(self, unread_only=False):
        """Récupère les alertes"""
        if unread_only:
            return [a for a in self.alerts if not a["read"]]
        return list(self.alerts)
    
    def mark_alerts_read(self):
        """Marque toutes les alertes comme lues"""
        for alert in self.alerts:
            alert["read"] = True
