#!/bin/bash
echo ">>> Installation Automatisée de MCPanel Pro <<<"

# Vérification Docker
if ! command -v docker &> /dev/null; then
    echo "[!] Docker n'est pas installé."
    echo "    Tentative d'installation automatique..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "[!] Veuillez vous déconnecter et reconnecter pour appliquer les permissions Docker, puis relancez ce script."
    rm get-docker.sh
    exit 1
fi

# Vérification Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "[!] Installation de Docker Compose..."
    sudo apt-get install -y docker-compose-plugin docker-compose || error "Echec install docker-compose"
fi

echo "[*] Configuration de l'environnement..."
# Création des dossiers
mkdir -p servers data logs

echo "[*] Lancement du Launcher Hybride..."
# Installation des dépendances GUI locales si nécessaire (optionnel)
pip3 install PyQt6 PyQt6-WebEngine requests > /dev/null 2>&1 || echo "[Info] Dependances GUI non installées, mode Web uniquement."

# Lancement
python3 desktop_launcher.py
