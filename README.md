# MCPanel# 🎮 Manager Ultimate - Gestionnaire de Serveurs Minecraft



Panel de gestion de serveurs Minecraft PaperMC. Permet de créer, configurer et administrer plusieurs serveurs depuis une interface web.Manager web professionnel pour créer et gérer plusieurs serveurs Minecraft PaperMC avec une interface moderne.



## Fonctionnalités![Python](https://img.shields.io/badge/Python-3.11+-blue)

![Flask](https://img.shields.io/badge/Flask-3.0+-green)

- Création de serveurs PaperMC (téléchargement auto)![PaperMC](https://img.shields.io/badge/PaperMC-Latest-orange)

- Gestion multi-serveurs (start/stop/restart)

- Console temps réel avec envoi de commandes## ✨ Fonctionnalités

- Monitoring CPU/RAM

- Gestion des joueurs (inventaire, stats, actions)### 🖥️ Gestion des serveurs

- Installation de plugins via Hangar- ✅ Création automatique de serveurs PaperMC (toutes versions)

- Système de backups automatiques- ✅ Démarrage / Arrêt / Redémarrage

- Multi-utilisateurs avec rôles (admin/user)- ✅ Configuration RAM personnalisable (512MB - 8GB)

- Support multilingue (FR/EN/ES)- ✅ Console en temps réel avec logs

- ✅ Envoi de commandes directement depuis l'interface

## Prérequis- ✅ Suppression de serveurs



- Python 3.8+### 📊 Monitoring

- Java 17+ (21 recommandé pour MC 1.20.5+)- 📈 Utilisation CPU et RAM en temps réel (via psutil)

- 📝 Logs serveur avec coloration syntaxique

## Installation- 🔄 Rafraîchissement automatique du statut



```bash### 👥 Gestion des joueurs

pip install -r requirements.txt- 👤 Liste complète des joueurs connectés

python main.py- 📦 Visualisation de l'inventaire (fichiers NBT)

```- 📊 Statistiques détaillées :

  - Temps de jeu

Accès: http://127.0.0.1:5000  - Kills / Morts

  - Blocs minés

Premier compte créé = admin.  - Position dans le monde

  - Niveau d'expérience

## Configuration- 🎮 Actions rapides : OP, DEOP, Gamemode, Kick, Ban, Clear



Les serveurs sont stockés dans `./servers/`. Chaque serveur a son propre dossier avec sa config.### 🔌 Gestion des plugins

- 🔍 Recherche de plugins sur Hangar PaperMC

Pour changer le port de l'interface web, modifier la ligne `app.run()` dans `main.py`.- 📥 Installation en un clic

- 📋 Liste des plugins installés

## Structure- 🗑️ Désinstallation facile



```### ⚙️ Configuration avancée

├── main.py           # App Flask + routes API- 🎛️ Édition visuelle de server.properties

├── core/- 💾 Sauvegarde/Backup des serveurs

│   ├── manager.py    # Gestion serveurs MC- 🔧 Configuration personnalisée par serveur

│   ├── plugins.py    # API Hangar- 🛡️ Validation et sécurité des noms

│   ├── stats.py      # Stats joueurs (NBT)

│   ├── auth.py       # Auth + sessions## 🚀 Installation

│   ├── scheduler.py  # Backups planifiés

│   └── monitoring.py # Métriques système### Prérequis

├── app/- **Python 3.11+** (avec pip)

│   ├── templates/    # HTML- **Java 17+** (pour exécuter les serveurs Minecraft)

│   └── static/       # JS/CSS- **Connexion Internet** (pour télécharger PaperMC)

├── locales/          # Traductions

└── servers/          # Données serveurs### Installation des dépendances

```

```powershell

## API# Installer les packages Python

pip install -r requirements.txt

Principales routes:```



| Méthode | Route | Description |### Vérifier Java

|---------|-------|-------------|

| GET | `/api/servers` | Liste serveurs |```powershell

| POST | `/api/create` | Créer serveur |# Vérifier que Java est installé

| POST | `/api/server/{name}/start` | Démarrer |java -version

| POST | `/api/server/{name}/stop` | Arrêter |```

| GET | `/api/server/{name}/status` | Statut + metrics |

| GET | `/api/server/{name}/logs` | Logs console |Si Java n'est pas installé : [Télécharger Java](https://adoptium.net/)

| POST | `/api/server/{name}/command` | Envoyer commande |

| GET | `/api/server/{name}/players` | Joueurs connectés |## 🎯 Utilisation

| GET | `/api/plugins/search?q=` | Recherche plugins |

### Démarrer le manager

## Notes

```powershell

- Le téléchargement initial d'un serveur peut prendre quelques minutespython main.py

- Java est téléchargé automatiquement si nécessaire (Adoptium)```

- Les backups sont stockés dans `servers/_backups/`

### Accéder à l'interface

## Licence

Ouvrir le navigateur : **http://127.0.0.1:5000**

MIT

### Créer un serveur

1. Cliquer sur **"+ Créer"** dans la barre latérale
2. Entrer un nom (lettres, chiffres, `-` et `_` uniquement)
3. Choisir la version PaperMC
4. Sélectionner la quantité de RAM
5. Cliquer sur **"Créer"**

Le téléchargement du serveur démarre automatiquement (peut prendre quelques minutes).

### Gérer un serveur

1. Sélectionner le serveur dans la liste
2. Utiliser les boutons d'action :
   - ▶️ **Démarrer** : Lance le serveur
   - 🔄 **Redémarrer** : Redémarre le serveur
   - ⏹️ **Arrêter** : Arrête proprement le serveur
   - 💾 **Sauvegarder** : Crée un backup complet
   - 🗑️ **Supprimer** : Supprime définitivement

### Installer un plugin

1. Aller dans l'onglet **"Plugins"**
2. Rechercher un plugin (ex: "EssentialsX")
3. Cliquer sur **"Install"**
4. Redémarrer le serveur pour activer

## 📁 Structure du projet

```
serveur_minecraft/
├── main.py                 # Point d'entrée Flask
├── requirements.txt        # Dépendances Python
├── README.md              # Documentation
├── app/
│   ├── static/
│   │   ├── app.js         # JavaScript frontend
│   │   └── style.css      # Styles CSS
│   └── templates/
│       └── index.html     # Interface HTML
├── core/
│   ├── manager.py         # Gestion des serveurs
│   ├── plugins.py         # Gestion des plugins
│   └── stats.py           # Statistiques joueurs
└── servers/               # Dossier des serveurs (créé auto)
    ├── server1/
    ├── server2/
    └── _backups/          # Sauvegardes
```

## 🔧 Configuration

### Modifier la RAM d'un serveur

1. Sélectionner le serveur
2. Aller dans **"Paramètres"**
3. Ajuster RAM Min et RAM Max
4. Sauvegarder et redémarrer

### Configurer le chemin Java

Si Java n'est pas dans le PATH :

1. Aller dans **"Paramètres"**
2. Entrer le chemin complet (ex: `C:/Program Files/Java/jdk-17/bin/java.exe`)
3. Sauvegarder

## 🛡️ Sécurité

### Protections intégrées
- ✅ Validation des noms de serveurs (anti-injection)
- ✅ Protection contre path traversal
- ✅ Validation des UUIDs joueurs
- ✅ Échappement HTML (anti-XSS)
- ✅ Fermeture propre des fichiers
- ✅ Timeouts sur les requêtes HTTP

### Recommandations
- 🔒 Ne pas exposer le port 5000 sur Internet (usage local uniquement)
- 🔐 Ajouter une authentification si usage en réseau
- 💾 Faire des sauvegardes régulières

## 🐛 Dépannage

### Erreur "Java non trouvé"
```powershell
# Vérifier Java
java -version

# Ajouter Java au PATH ou configurer le chemin dans Paramètres
```

### Le serveur ne démarre pas
- Vérifier que le port 25565 n'est pas déjà utilisé
- Augmenter la RAM allouée
- Vérifier les logs dans la console

### Plugin ne fonctionne pas
- Redémarrer le serveur après installation
- Vérifier la compatibilité du plugin avec la version Minecraft

## 📝 API REST

### Endpoints principaux

```
GET  /api/servers              # Liste des serveurs
GET  /api/papermc/versions     # Versions PaperMC disponibles
POST /api/create               # Créer un serveur
POST /api/server/{name}/action # Démarrer/Arrêter/Redémarrer
GET  /api/server/{name}/status # Statut + métriques CPU/RAM
GET  /api/server/{name}/console # Logs du serveur
POST /api/server/{name}/command # Envoyer une commande
GET  /api/server/{name}/players # Liste des joueurs
GET  /api/server/{name}/plugins # Plugins installés
POST /api/server/{name}/backup  # Créer une sauvegarde
```

## 🎨 Technologies utilisées

- **Backend** : Flask (Python)
- **Frontend** : Vanilla JavaScript + CSS
- **Serveurs** : PaperMC (Minecraft)
- **Monitoring** : psutil
- **NBT** : nbtlib (lecture fichiers joueurs)
- **API** : Hangar PaperMC

## 📄 Licence

Ce projet est libre d'utilisation pour un usage personnel et éducatif.

## 🤝 Contribution

Les suggestions et améliorations sont les bienvenues !

### Idées d'améliorations futures
- 🔐 Système d'authentification
- 🌐 Support multi-langues
- 📱 Interface mobile optimisée
- 🔄 Auto-restart en cas de crash
- 📊 Graphiques de performances
- 🗺️ Viewer de maps
- 💬 Chat intégré
- 📦 Import/Export de serveurs

## 📞 Support

En cas de problème :
1. Vérifier les logs dans la console
2. Vérifier que Python 3.11+ est installé
3. Vérifier que Java 17+ est installé
4. Réinstaller les dépendances : `pip install -r requirements.txt`

---

**Développé avec ❤️ pour la communauté Minecraft**
