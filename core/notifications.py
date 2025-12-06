import json
import os
import smtplib
import threading
from collections import deque
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests


class NotificationManager:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        self.config_file = os.path.join(data_dir, "notifications_config.json")
        self.history_file = os.path.join(data_dir, "notifications_history.json")
        self.notifications = deque(maxlen=100)
        
        os.makedirs(data_dir, exist_ok=True)
        self._load_history()
    
    def _load_config(self):
        """Charge la configuration des notifications"""
        if not os.path.exists(self.config_file):
            return self._default_config()
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return self._default_config()
    
    def _default_config(self):
        """Configuration par défaut"""
        return {
            "discord": {
                "enabled": False,
                "webhook_url": "",
                "events": ["server_start", "server_stop", "crash", "backup", "alert"]
            },
            "email": {
                "enabled": False,
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "smtp_user": "",
                "smtp_password": "",
                "from_email": "",
                "to_emails": [],
                "events": ["crash", "backup", "alert"]
            },
            "in_app": {
                "enabled": True,
                "events": ["all"]
            }
        }
    
    def save_config(self, config):
        """Sauvegarde la configuration"""
        with open(self.config_file, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return {"success": True, "message": "Configuration sauvegardée"}
    
    def get_config(self):
        """Récupère la configuration (sans les mots de passe)"""
        config = self._load_config()
        # Masquer le mot de passe SMTP
        if "email" in config and "smtp_password" in config["email"]:
            if config["email"]["smtp_password"]:
                config["email"]["smtp_password"] = "********"
        return config
    
    def _load_history(self):
        """Charge l'historique des notifications"""
        try:
            if os.path.exists(self.history_file):
                with open(self.history_file, "r", encoding="utf-8") as f:
                    history = json.load(f)
                    self.notifications = deque(history, maxlen=100)
        except:
            pass
    
    def _save_history(self):
        """Sauvegarde l'historique"""
        try:
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump(list(self.notifications), f, indent=2, ensure_ascii=False)
        except:
            pass
    
    def notify(self, event_type, title, message, server=None, severity="info"):
        """Envoie une notification sur tous les canaux configurés"""
        notification = {
            "id": datetime.now().strftime("%Y%m%d%H%M%S%f"),
            "timestamp": datetime.now().isoformat(),
            "type": event_type,
            "title": title,
            "message": message,
            "server": server,
            "severity": severity,  # info, warning, error, success
            "read": False
        }
        
        # Ajouter à l'historique in-app
        self.notifications.appendleft(notification)
        self._save_history()
        
        config = self._load_config()
        
        # Discord (async)
        if config.get("discord", {}).get("enabled"):
            if event_type in config["discord"].get("events", []) or "all" in config["discord"].get("events", []):
                threading.Thread(
                    target=self._send_discord,
                    args=[config["discord"]["webhook_url"], notification],
                    daemon=True
                ).start()
        
        # Email (async)
        if config.get("email", {}).get("enabled"):
            if event_type in config["email"].get("events", []) or "all" in config["email"].get("events", []):
                threading.Thread(
                    target=self._send_email,
                    args=[config["email"], notification],
                    daemon=True
                ).start()
        
        return notification
    
    def _send_discord(self, webhook_url, notification):
        """Envoie une notification Discord"""
        try:
            # Couleur selon sévérité
            colors = {
                "info": 0x3498db,      # Bleu
                "success": 0x2ecc71,   # Vert
                "warning": 0xf39c12,   # Orange
                "error": 0xe74c3c      # Rouge
            }
            
            # Icônes
            icons = {
                "server_start": "🟢",
                "server_stop": "🔴",
                "crash": "💥",
                "backup": "💾",
                "alert": "⚠️",
                "info": "ℹ️"
            }
            
            icon = icons.get(notification["type"], "📢")
            
            embed = {
                "title": f"{icon} {notification['title']}",
                "description": notification["message"],
                "color": colors.get(notification["severity"], 0x3498db),
                "timestamp": notification["timestamp"],
                "footer": {
                    "text": f"Minecraft Server Manager Pro"
                }
            }
            
            if notification.get("server"):
                embed["fields"] = [
                    {"name": "Serveur", "value": notification["server"], "inline": True}
                ]
            
            payload = {
                "embeds": [embed]
            }
            
            response = requests.post(
                webhook_url,
                json=payload,
                timeout=10
            )
            
            if response.status_code not in [200, 204]:
                print(f"[NOTIF] Discord erreur: {response.status_code}")
                
        except Exception as e:
            print(f"[NOTIF] Discord erreur: {e}")
    
    def _send_email(self, email_config, notification):
        """Envoie une notification par email"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"[Minecraft Manager] {notification['title']}"
            msg['From'] = email_config["from_email"]
            msg['To'] = ", ".join(email_config["to_emails"])
            
            # Version texte
            text = f"""
{notification['title']}

{notification['message']}

Serveur: {notification.get('server', 'N/A')}
Date: {notification['timestamp']}
Type: {notification['type']}
            """
            
            # Version HTML
            severity_colors = {
                "info": "#3498db",
                "success": "#2ecc71",
                "warning": "#f39c12",
                "error": "#e74c3c"
            }
            color = severity_colors.get(notification["severity"], "#3498db")
            
            html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }}
        .card {{ background: white; border-radius: 10px; padding: 20px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .header {{ border-left: 4px solid {color}; padding-left: 15px; margin-bottom: 15px; }}
        .title {{ font-size: 18px; font-weight: bold; color: #333; }}
        .message {{ color: #666; margin: 15px 0; }}
        .meta {{ font-size: 12px; color: #999; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="title">{notification['title']}</div>
        </div>
        <div class="message">{notification['message']}</div>
        <div class="meta">
            Serveur: {notification.get('server', 'N/A')} | 
            Date: {notification['timestamp'][:19].replace('T', ' ')}
        </div>
    </div>
</body>
</html>
            """
            
            msg.attach(MIMEText(text, 'plain'))
            msg.attach(MIMEText(html, 'html'))
            
            # Connexion SMTP
            with smtplib.SMTP(email_config["smtp_host"], email_config["smtp_port"]) as server:
                server.starttls()
                server.login(email_config["smtp_user"], email_config["smtp_password"])
                server.send_message(msg)
            
            print(f"[NOTIF] Email envoyé à {email_config['to_emails']}")
            
        except Exception as e:
            print(f"[NOTIF] Email erreur: {e}")
    
    def get_notifications(self, limit=50, unread_only=False):
        """Récupère les notifications"""
        notifications = list(self.notifications)
        if unread_only:
            notifications = [n for n in notifications if not n.get("read")]
        return notifications[:limit]
    
    def mark_read(self, notification_id=None):
        """Marque des notifications comme lues"""
        for notif in self.notifications:
            if notification_id is None or notif["id"] == notification_id:
                notif["read"] = True
        self._save_history()
        return {"success": True}
    
    def clear_notifications(self):
        """Supprime toutes les notifications"""
        self.notifications.clear()
        self._save_history()
        return {"success": True}
    
    def test_discord(self, webhook_url):
        """Teste un webhook Discord"""
        try:
            test_notif = {
                "type": "test",
                "title": "Test de connexion",
                "message": "Le webhook Discord fonctionne correctement!",
                "server": None,
                "severity": "success",
                "timestamp": datetime.now().isoformat()
            }
            self._send_discord(webhook_url, test_notif)
            return {"success": True, "message": "Message de test envoyé"}
        except Exception as e:
            return {"success": False, "message": str(e)}
    
    def test_email(self, email_config):
        """Teste la configuration email"""
        try:
            test_notif = {
                "type": "test",
                "title": "Test de connexion email",
                "message": "La configuration email fonctionne correctement!",
                "server": None,
                "severity": "success",
                "timestamp": datetime.now().isoformat()
            }
            self._send_email(email_config, test_notif)
            return {"success": True, "message": "Email de test envoyé"}
        except Exception as e:
            return {"success": False, "message": str(e)}


# Instance globale
notification_manager = NotificationManager()


def notify(event_type, title, message, server=None, severity="info"):
    """Fonction helper pour envoyer des notifications"""
    return notification_manager.notify(event_type, title, message, server, severity)
