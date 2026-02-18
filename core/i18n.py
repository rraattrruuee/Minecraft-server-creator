import json
import os
import logging
from flask import request, session

logger = logging.getLogger(__name__)


class I18n:
    def __init__(self, locales_dir="locales"):
        self.locales_dir = locales_dir
        self.translations = {}
        self.default_lang = "fr"
        self.supported_languages = ["fr", "en", "es"]
        
        os.makedirs(locales_dir, exist_ok=True)
        self._init_translations()
        self._load_all_translations()
    
    def _init_translations(self):
        """Initialise les fichiers de traduction par défaut"""
        # Français (par défaut)
        fr = {
            "app": {
                "title": "MCPanel",
                "subtitle": "Gestionnaire de serveurs Minecraft"
            },
            "nav": {
                "dashboard": "Tableau de bord",
                "servers": "Serveurs",
                "plugins": "Plugins",
                "players": "Joueurs",
                "backups": "Sauvegardes",
                "settings": "Paramètres",
                "users": "Utilisateurs",
                "logs": "Logs",
                "notifications": "Notifications"
            },
            "auth": {
                "login": "Connexion",
                "logout": "Déconnexion",
                "username": "Nom d'utilisateur",
                "password": "Mot de passe",
                "remember_me": "Se souvenir de moi",
                "login_button": "Se connecter",
                "login_error": "Identifiants incorrects",
                "login_success": "Connexion réussie",
                "secure_connection": "Connexion sécurisée"
            },
            "server": {
                "name": "Nom du serveur",
                "version": "Version",
                "status": "Statut",
                "players": "Joueurs",
                "uptime": "Temps de fonctionnement",
                "ram": "RAM",
                "cpu": "CPU",
                "start": "Démarrer",
                "stop": "Arrêter",
                "restart": "Redémarrer",
                "delete": "Supprimer",
                "backup": "Sauvegarder",
                "console": "Console",
                "config": "Configuration",
                "online": "En ligne",
                "offline": "Hors ligne",
                "starting": "Démarrage...",
                "stopping": "Arrêt...",
                "create": "Créer un serveur",
                "create_title": "Nouveau serveur",
                "ram_min": "RAM minimum",
                "ram_max": "RAM maximum",
                "confirm_delete": "Êtes-vous sûr de vouloir supprimer ce serveur ?",
                "delete_warning": "Cette action est irréversible !"
            },
            "plugin": {
                "search": "Rechercher des plugins",
                "search_placeholder": "Nom du plugin...",
                "install": "Installer",
                "uninstall": "Désinstaller",
                "installed": "Plugins installés",
                "available": "Plugins disponibles",
                "no_plugins": "Aucun plugin installé",
                "version": "Version",
                "author": "Auteur",
                "downloads": "Téléchargements",
                "description": "Description"
            },
            "backup": {
                "create": "Créer une sauvegarde",
                "restore": "Restaurer",
                "delete": "Supprimer",
                "schedule": "Planifier",
                "scheduled_backups": "Sauvegardes planifiées",
                "manual_backup": "Sauvegarde manuelle",
                "last_backup": "Dernière sauvegarde",
                "next_backup": "Prochaine sauvegarde",
                "retention": "Rétention",
                "compression": "Compression",
                "daily": "Quotidien",
                "weekly": "Hebdomadaire",
                "hourly": "Toutes les heures",
                "custom": "Personnalisé"
            },
            "player": {
                "name": "Nom",
                "uuid": "UUID",
                "last_seen": "Dernière connexion",
                "play_time": "Temps de jeu",
                "op": "Donner OP",
                "deop": "Retirer OP",
                "kick": "Expulser",
                "ban": "Bannir",
                "unban": "Débannir",
                "whitelist": "Whitelist",
                "online_players": "Joueurs en ligne",
                "all_players": "Tous les joueurs"
            },
            "settings": {
                "general": "Général",
                "appearance": "Apparence",
                "notifications": "Notifications",
                "security": "Sécurité",
                "language": "Langue",
                "theme": "Thème",
                "dark_mode": "Mode sombre",
                "light_mode": "Mode clair",
                "discord": "Discord",
                "email": "Email",
                "webhook_url": "URL du Webhook",
                "smtp_host": "Serveur SMTP",
                "smtp_port": "Port SMTP",
                "save": "Sauvegarder",
                "test": "Tester",
                "enabled": "Activé",
                "disabled": "Désactivé"
            },
            "metrics": {
                "cpu_usage": "Utilisation CPU",
                "ram_usage": "Utilisation RAM",
                "disk_usage": "Utilisation disque",
                "tps": "TPS",
                "players_online": "Joueurs en ligne",
                "uptime": "Temps de fonctionnement"
            },
            "common": {
                "loading": "Chargement...",
                "error": "Erreur",
                "success": "Succès",
                "warning": "Attention",
                "info": "Information",
                "confirm": "Confirmer",
                "cancel": "Annuler",
                "close": "Fermer",
                "save": "Sauvegarder",
                "edit": "Modifier",
                "delete": "Supprimer",
                "refresh": "Actualiser",
                "search": "Rechercher",
                "filter": "Filtrer",
                "export": "Exporter",
                "import": "Importer",
                "copy": "Copier",
                "yes": "Oui",
                "no": "Non",
                "all": "Tous",
                "none": "Aucun",
                "select": "Sélectionner"
            },
            "time": {
                "just_now": "À l'instant",
                "minutes_ago": "il y a {n} min",
                "hours_ago": "il y a {n}h",
                "days_ago": "il y a {n} jours",
                "seconds": "secondes",
                "minutes": "minutes",
                "hours": "heures",
                "days": "jours"
            }
        }
        
        # Anglais
        en = {
            "app": {
                "title": "MCPanel",
                "subtitle": "Minecraft Server Manager"
            },
            "nav": {
                "dashboard": "Dashboard",
                "servers": "Servers",
                "plugins": "Plugins",
                "players": "Players",
                "backups": "Backups",
                "settings": "Settings",
                "users": "Users",
                "logs": "Logs",
                "notifications": "Notifications"
            },
            "auth": {
                "login": "Login",
                "logout": "Logout",
                "username": "Username",
                "password": "Password",
                "remember_me": "Remember me",
                "login_button": "Sign in",
                "login_error": "Invalid credentials",
                "login_success": "Login successful",
                "secure_connection": "Secure connection"
            },
            "server": {
                "name": "Server name",
                "version": "Version",
                "status": "Status",
                "players": "Players",
                "uptime": "Uptime",
                "ram": "RAM",
                "cpu": "CPU",
                "start": "Start",
                "stop": "Stop",
                "restart": "Restart",
                "delete": "Delete",
                "backup": "Backup",
                "console": "Console",
                "config": "Configuration",
                "online": "Online",
                "offline": "Offline",
                "starting": "Starting...",
                "stopping": "Stopping...",
                "create": "Create server",
                "create_title": "New server",
                "ram_min": "Minimum RAM",
                "ram_max": "Maximum RAM",
                "confirm_delete": "Are you sure you want to delete this server?",
                "delete_warning": "This action cannot be undone!"
            },
            "plugin": {
                "search": "Search plugins",
                "search_placeholder": "Plugin name...",
                "install": "Install",
                "uninstall": "Uninstall",
                "installed": "Installed plugins",
                "available": "Available plugins",
                "no_plugins": "No plugins installed",
                "version": "Version",
                "author": "Author",
                "downloads": "Downloads",
                "description": "Description"
            },
            "backup": {
                "create": "Create backup",
                "restore": "Restore",
                "delete": "Delete",
                "schedule": "Schedule",
                "scheduled_backups": "Scheduled backups",
                "manual_backup": "Manual backup",
                "last_backup": "Last backup",
                "next_backup": "Next backup",
                "retention": "Retention",
                "compression": "Compression",
                "daily": "Daily",
                "weekly": "Weekly",
                "hourly": "Hourly",
                "custom": "Custom"
            },
            "player": {
                "name": "Name",
                "uuid": "UUID",
                "last_seen": "Last seen",
                "play_time": "Play time",
                "op": "Give OP",
                "deop": "Remove OP",
                "kick": "Kick",
                "ban": "Ban",
                "unban": "Unban",
                "whitelist": "Whitelist",
                "online_players": "Online players",
                "all_players": "All players"
            },
            "settings": {
                "general": "General",
                "appearance": "Appearance",
                "notifications": "Notifications",
                "security": "Security",
                "language": "Language",
                "theme": "Theme",
                "dark_mode": "Dark mode",
                "light_mode": "Light mode",
                "discord": "Discord",
                "email": "Email",
                "webhook_url": "Webhook URL",
                "smtp_host": "SMTP Server",
                "smtp_port": "SMTP Port",
                "save": "Save",
                "test": "Test",
                "enabled": "Enabled",
                "disabled": "Disabled"
            },
            "metrics": {
                "cpu_usage": "CPU Usage",
                "ram_usage": "RAM Usage",
                "disk_usage": "Disk Usage",
                "tps": "TPS",
                "players_online": "Players Online",
                "uptime": "Uptime"
            },
            "common": {
                "loading": "Loading...",
                "error": "Error",
                "success": "Success",
                "warning": "Warning",
                "info": "Information",
                "confirm": "Confirm",
                "cancel": "Cancel",
                "close": "Close",
                "save": "Save",
                "edit": "Edit",
                "delete": "Delete",
                "refresh": "Refresh",
                "search": "Search",
                "filter": "Filter",
                "export": "Export",
                "import": "Import",
                "copy": "Copy",
                "yes": "Yes",
                "no": "No",
                "all": "All",
                "none": "None",
                "select": "Select"
            },
            "time": {
                "just_now": "Just now",
                "minutes_ago": "{n} min ago",
                "hours_ago": "{n}h ago",
                "days_ago": "{n} days ago",
                "seconds": "seconds",
                "minutes": "minutes",
                "hours": "hours",
                "days": "days"
            }
        }
        
        # Espagnol
        es = {
            "app": {
                "title": "MCPanel",
                "subtitle": "Gestor de servidores Minecraft"
            },
            "nav": {
                "dashboard": "Panel",
                "servers": "Servidores",
                "plugins": "Plugins",
                "players": "Jugadores",
                "backups": "Copias de seguridad",
                "settings": "Configuración",
                "users": "Usuarios",
                "logs": "Registros",
                "notifications": "Notificaciones"
            },
            "auth": {
                "login": "Iniciar sesión",
                "logout": "Cerrar sesión",
                "username": "Nombre de usuario",
                "password": "Contraseña",
                "remember_me": "Recordarme",
                "login_button": "Entrar",
                "login_error": "Credenciales incorrectas",
                "login_success": "Inicio de sesión exitoso",
                "secure_connection": "Conexión segura"
            },
            "server": {
                "name": "Nombre del servidor",
                "version": "Versión",
                "status": "Estado",
                "players": "Jugadores",
                "uptime": "Tiempo activo",
                "ram": "RAM",
                "cpu": "CPU",
                "start": "Iniciar",
                "stop": "Detener",
                "restart": "Reiniciar",
                "delete": "Eliminar",
                "backup": "Respaldar",
                "console": "Consola",
                "config": "Configuración",
                "online": "En línea",
                "offline": "Fuera de línea",
                "starting": "Iniciando...",
                "stopping": "Deteniendo...",
                "create": "Crear servidor",
                "create_title": "Nuevo servidor",
                "ram_min": "RAM mínima",
                "ram_max": "RAM máxima",
                "confirm_delete": "¿Estás seguro de que quieres eliminar este servidor?",
                "delete_warning": "¡Esta acción no se puede deshacer!"
            },
            "plugin": {
                "search": "Buscar plugins",
                "search_placeholder": "Nombre del plugin...",
                "install": "Instalar",
                "uninstall": "Desinstalar",
                "installed": "Plugins instalados",
                "available": "Plugins disponibles",
                "no_plugins": "No hay plugins instalados",
                "version": "Versión",
                "author": "Autor",
                "downloads": "Descargas",
                "description": "Descripción"
            },
            "backup": {
                "create": "Crear copia",
                "restore": "Restaurar",
                "delete": "Eliminar",
                "schedule": "Programar",
                "scheduled_backups": "Copias programadas",
                "manual_backup": "Copia manual",
                "last_backup": "Última copia",
                "next_backup": "Próxima copia",
                "retention": "Retención",
                "compression": "Compresión",
                "daily": "Diario",
                "weekly": "Semanal",
                "hourly": "Cada hora",
                "custom": "Personalizado"
            },
            "player": {
                "name": "Nombre",
                "uuid": "UUID",
                "last_seen": "Última vez visto",
                "play_time": "Tiempo de juego",
                "op": "Dar OP",
                "deop": "Quitar OP",
                "kick": "Expulsar",
                "ban": "Banear",
                "unban": "Desbanear",
                "whitelist": "Lista blanca",
                "online_players": "Jugadores en línea",
                "all_players": "Todos los jugadores"
            },
            "settings": {
                "general": "General",
                "appearance": "Apariencia",
                "notifications": "Notificaciones",
                "security": "Seguridad",
                "language": "Idioma",
                "theme": "Tema",
                "dark_mode": "Modo oscuro",
                "light_mode": "Modo claro",
                "discord": "Discord",
                "email": "Correo",
                "webhook_url": "URL del Webhook",
                "smtp_host": "Servidor SMTP",
                "smtp_port": "Puerto SMTP",
                "save": "Guardar",
                "test": "Probar",
                "enabled": "Activado",
                "disabled": "Desactivado"
            },
            "metrics": {
                "cpu_usage": "Uso de CPU",
                "ram_usage": "Uso de RAM",
                "disk_usage": "Uso de disco",
                "tps": "TPS",
                "players_online": "Jugadores en línea",
                "uptime": "Tiempo activo"
            },
            "common": {
                "loading": "Cargando...",
                "error": "Error",
                "success": "Éxito",
                "warning": "Advertencia",
                "info": "Información",
                "confirm": "Confirmar",
                "cancel": "Cancelar",
                "close": "Cerrar",
                "save": "Guardar",
                "edit": "Editar",
                "delete": "Eliminar",
                "refresh": "Actualizar",
                "search": "Buscar",
                "filter": "Filtrar",
                "export": "Exportar",
                "import": "Importar",
                "copy": "Copiar",
                "yes": "Sí",
                "no": "No",
                "all": "Todos",
                "none": "Ninguno",
                "select": "Seleccionar"
            },
            "time": {
                "just_now": "Ahora mismo",
                "minutes_ago": "hace {n} min",
                "hours_ago": "hace {n}h",
                "days_ago": "hace {n} días",
                "seconds": "segundos",
                "minutes": "minutos",
                "hours": "horas",
                "days": "días"
            }
        }
        
        # Sauvegarder les fichiers de traduction
        translations = {"fr": fr, "en": en, "es": es}
        for lang, data in translations.items():
            file_path = os.path.join(self.locales_dir, f"{lang}.json")
            if not os.path.exists(file_path):
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
    
    def _load_all_translations(self):
        """Charge toutes les traductions"""
        for lang in self.supported_languages:
            file_path = os.path.join(self.locales_dir, f"{lang}.json")
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    self.translations[lang] = json.load(f)
            except Exception as e:
                logger.error(f"Erreur chargement {lang}: {e}")
                self.translations[lang] = {}
    
    def get_language(self):
        """Récupère la langue actuelle"""
        # Priorité: session > cookie(mcp_lang) > Accept-Language > défaut
        if "lang" in session:
            return session["lang"]

        cookie_lang = request.cookies.get("mcp_lang")
        if cookie_lang and cookie_lang in self.supported_languages:
            return cookie_lang

        # Accept-Language header
        accept_lang = request.headers.get("Accept-Language", "")
        for lang in self.supported_languages:
            if lang in accept_lang.lower():
                return lang

        return self.default_lang
    
    def set_language(self, lang):
        """Définit la langue"""
        if lang in self.supported_languages:
            session["lang"] = lang
            return True
        return False
    
    def t(self, key, lang=None, **kwargs):
        """Traduit une clé"""
        if lang is None:
            lang = self.get_language()
        
        translations = self.translations.get(lang, {})
        
        # Naviguer dans les clés imbriquées
        keys = key.split(".")
        value = translations
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                value = None
                break
        
        if value is None:
            # Fallback sur la langue par défaut
            value = self.translations.get(self.default_lang, {})
            for k in keys:
                if isinstance(value, dict):
                    value = value.get(k)
                else:
                    value = key  # Retourner la clé si pas trouvé
                    break
        
        # Remplacer les variables
        if isinstance(value, str):
            for var, val in kwargs.items():
                value = value.replace(f"{{{var}}}", str(val))
        
        return value if value else key
    
    def get_all_translations(self, lang=None):
        """Récupère toutes les traductions pour une langue"""
        if lang is None:
            lang = self.get_language()
        return self.translations.get(lang, {})


# Instance globale
i18n = I18n()
