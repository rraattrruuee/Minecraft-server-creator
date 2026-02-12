import requests
import logging
import threading
import json
import os

class WebhookManager:
    """
    Gère l'envoi de webhooks pour les événements du cycle de vie des serveurs.
    """
    
    def __init__(self, config_file="data/webhooks.json"):
        self.config_file = config_file
        self.listeners = self._load_listeners()
        self.logger = logging.getLogger("Webhooks")

    def _load_listeners(self):
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}

    def save_listeners(self):
        with open(self.config_file, 'w') as f:
            json.dump(self.listeners, f, indent=2)

    def add_webhook(self, url: str, events: list):
        """Ajoute un webhook"""
        self.listeners[url] = events
        self.save_listeners()

    def dispatch(self, event_type: str, payload: dict):
        """Envoie l'événement aux webhooks abonnés (async)"""
        for url, events in self.listeners.items():
            if event_type in events or "*" in events:
                threading.Thread(target=self._send, args=(url, event_type, payload)).start()

    def _send(self, url, event_type, payload):
        try:
            data = {
                "event": event_type,
                "timestamp": int(time.time()),
                "data": payload
            }
            requests.post(url, json=data, timeout=5)
            self.logger.info(f"Webhook sent to {url} for {event_type}")
        except Exception as e:
            self.logger.error(f"Webhook failed {url}: {e}")

import time
