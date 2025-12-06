import json
import os
import shutil
import threading
import zipfile
from datetime import datetime, timedelta

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    HAS_APSCHEDULER = True
except ImportError:
    HAS_APSCHEDULER = False
    print("[SCHEDULER] APScheduler non installé - sauvegardes planifiées désactivées")


class BackupScheduler:
    def __init__(self, server_manager, data_dir="data"):
        self.srv_mgr = server_manager
        self.data_dir = data_dir
        self.config_file = os.path.join(data_dir, "backup_schedules.json")
        self.scheduler = None
        self.jobs = {}  # {server_name: job_id}
        
        os.makedirs(data_dir, exist_ok=True)
        
        if HAS_APSCHEDULER:
            self.scheduler = BackgroundScheduler()
            self.scheduler.start()
            self._load_schedules()
            print("[SCHEDULER] Planificateur de sauvegardes initialisé")
    
    def _load_schedules(self):
        """Charge et applique les schedules sauvegardés"""
        if not os.path.exists(self.config_file):
            return
        
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                schedules = json.load(f)
            
            for server_name, config in schedules.items():
                if config.get("enabled", False):
                    self._add_job(server_name, config)
        except Exception as e:
            print(f"[SCHEDULER] Erreur chargement schedules: {e}")
    
    def _save_schedules(self, schedules):
        """Sauvegarde les schedules"""
        with open(self.config_file, "w", encoding="utf-8") as f:
            json.dump(schedules, f, indent=2, ensure_ascii=False)
    
    def _get_schedules(self):
        """Récupère tous les schedules"""
        if not os.path.exists(self.config_file):
            return {}
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    
    def _add_job(self, server_name, config):
        """Ajoute un job de sauvegarde"""
        if not self.scheduler:
            return False
        
        try:
            # Supprimer l'ancien job si existant
            if server_name in self.jobs:
                self.scheduler.remove_job(self.jobs[server_name])
            
            # Parser le schedule (format cron ou prédéfini)
            schedule_type = config.get("type", "daily")
            
            if schedule_type == "hourly":
                trigger = CronTrigger(minute=0)
            elif schedule_type == "daily":
                hour = config.get("hour", 3)  # 3h du matin par défaut
                trigger = CronTrigger(hour=hour, minute=0)
            elif schedule_type == "weekly":
                day = config.get("day_of_week", "sun")
                hour = config.get("hour", 3)
                trigger = CronTrigger(day_of_week=day, hour=hour, minute=0)
            elif schedule_type == "custom":
                # Format cron personnalisé
                cron = config.get("cron", "0 3 * * *")
                parts = cron.split()
                trigger = CronTrigger(
                    minute=parts[0] if len(parts) > 0 else "0",
                    hour=parts[1] if len(parts) > 1 else "*",
                    day=parts[2] if len(parts) > 2 else "*",
                    month=parts[3] if len(parts) > 3 else "*",
                    day_of_week=parts[4] if len(parts) > 4 else "*"
                )
            else:
                trigger = CronTrigger(hour=3, minute=0)
            
            job = self.scheduler.add_job(
                self._execute_backup,
                trigger,
                args=[server_name, config],
                id=f"backup_{server_name}",
                replace_existing=True
            )
            
            self.jobs[server_name] = job.id
            print(f"[SCHEDULER] Backup programmé pour {server_name}: {schedule_type}")
            return True
            
        except Exception as e:
            print(f"[SCHEDULER] Erreur ajout job {server_name}: {e}")
            return False
    
    def set_schedule(self, server_name, config):
        """Configure le schedule d'un serveur"""
        if not HAS_APSCHEDULER:
            return {"success": False, "message": "APScheduler non installé"}
        
        schedules = self._get_schedules()
        schedules[server_name] = {
            "enabled": config.get("enabled", True),
            "type": config.get("type", "daily"),
            "hour": config.get("hour", 3),
            "day_of_week": config.get("day_of_week", "sun"),
            "cron": config.get("cron", ""),
            "retention": config.get("retention", 7),  # Garder 7 backups
            "compress": config.get("compress", True),
            "notify": config.get("notify", True)
        }
        self._save_schedules(schedules)
        
        if config.get("enabled", True):
            self._add_job(server_name, schedules[server_name])
        else:
            self.remove_schedule(server_name)
        
        return {"success": True, "message": "Schedule configuré"}
    
    def remove_schedule(self, server_name):
        """Supprime le schedule d'un serveur"""
        if server_name in self.jobs and self.scheduler:
            try:
                self.scheduler.remove_job(self.jobs[server_name])
                del self.jobs[server_name]
            except:
                pass
        
        schedules = self._get_schedules()
        if server_name in schedules:
            schedules[server_name]["enabled"] = False
            self._save_schedules(schedules)
        
        return {"success": True}
    
    def get_schedule(self, server_name):
        """Récupère le schedule d'un serveur"""
        schedules = self._get_schedules()
        default = {
            "enabled": False,
            "type": "daily",
            "hour": 3,
            "day_of_week": "sun",
            "cron": "",
            "retention": 7,
            "compress": True,
            "notify": True
        }
        return schedules.get(server_name, default)
    
    def get_all_schedules(self):
        """Récupère tous les schedules"""
        schedules = self._get_schedules()
        result = []
        for name, config in schedules.items():
            next_run = None
            if name in self.jobs and self.scheduler:
                job = self.scheduler.get_job(self.jobs[name])
                if job and job.next_run_time:
                    next_run = job.next_run_time.isoformat()
            
            result.append({
                "server": name,
                "config": config,
                "next_run": next_run
            })
        return result
    
    def _execute_backup(self, server_name, config):
        """Exécute une sauvegarde planifiée"""
        print(f"[SCHEDULER] Exécution backup planifié: {server_name}")
        
        try:
            # Créer le backup
            result = self.srv_mgr.backup_server(server_name)
            
            if not result:
                print(f"[SCHEDULER] Échec backup {server_name}")
                return
            
            # Compression si activée
            if config.get("compress", True):
                backup_path = result.get("path", "")
                if backup_path and os.path.isdir(backup_path):
                    self._compress_backup(backup_path)
            
            # Rotation - supprimer les vieux backups
            retention = config.get("retention", 7)
            self._rotate_backups(server_name, retention)
            
            # Notification
            if config.get("notify", True):
                self._notify_backup_complete(server_name, result)
            
            print(f"[SCHEDULER] Backup {server_name} terminé avec succès")
            
        except Exception as e:
            print(f"[SCHEDULER] Erreur backup {server_name}: {e}")
    
    def _compress_backup(self, backup_path):
        """Compresse un dossier de backup en zip"""
        try:
            zip_path = f"{backup_path}.zip"
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(backup_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, backup_path)
                        zipf.write(file_path, arcname)
            
            # Supprimer le dossier original
            shutil.rmtree(backup_path)
            print(f"[SCHEDULER] Backup compressé: {zip_path}")
            return zip_path
        except Exception as e:
            print(f"[SCHEDULER] Erreur compression: {e}")
            return None
    
    def _rotate_backups(self, server_name, retention):
        """Supprime les vieux backups au-delà de la limite"""
        try:
            backup_dir = os.path.join(self.srv_mgr.base_dir, "_backups")
            if not os.path.exists(backup_dir):
                return
            
            # Lister les backups de ce serveur
            prefix = f"{server_name}_"
            backups = []
            
            for item in os.listdir(backup_dir):
                if item.startswith(prefix):
                    path = os.path.join(backup_dir, item)
                    mtime = os.path.getmtime(path)
                    backups.append((path, mtime))
            
            # Trier par date (plus récent en premier)
            backups.sort(key=lambda x: x[1], reverse=True)
            
            # Supprimer les backups excédentaires
            for path, _ in backups[retention:]:
                if os.path.isdir(path):
                    shutil.rmtree(path)
                else:
                    os.remove(path)
                print(f"[SCHEDULER] Ancien backup supprimé: {os.path.basename(path)}")
                
        except Exception as e:
            print(f"[SCHEDULER] Erreur rotation: {e}")
    
    def _notify_backup_complete(self, server_name, result):
        """Envoie une notification de backup terminé"""
        # TODO: Intégrer avec le système de notifications (Discord, email)
        pass
    
    def trigger_backup_now(self, server_name):
        """Déclenche un backup immédiat"""
        config = self.get_schedule(server_name)
        threading.Thread(
            target=self._execute_backup,
            args=[server_name, config],
            daemon=True
        ).start()
        return {"success": True, "message": "Backup lancé"}
    
    def shutdown(self):
        """Arrête le scheduler proprement"""
        if self.scheduler:
            self.scheduler.shutdown(wait=False)
            print("[SCHEDULER] Planificateur arrêté")
