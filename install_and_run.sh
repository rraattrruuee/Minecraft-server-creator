#!/bin/bash
set -e
echo ">>> Installation Automatisée de MCPanel Pro <<<"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}[ERREUR] $1${NC}"
    exit 1
}

info() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

# Vérification Docker
if ! command -v docker &> /dev/null; then
    info "Docker n'est pas installé. Tentative d'installation automatique..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    info "Docker installé avec succès."
    rm get-docker.sh
    RESTART_NEEDED=true
fi

# Vérification Docker Compose (V2 intégré à docker cli ou binaire séparé)
if ! docker compose version &> /dev/null; then
    info "Installation de Docker Compose V2..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-v2 || sudo apt-get install -y docker-compose
fi

# Initialisation Docker Swarm si nécessaire
if [ "$(docker info --format '{{.Swarm.LocalNodeState}}')" != "active" ]; then
    info "Initialisation du cluster Docker Swarm..."
    docker swarm init --advertise-addr 127.0.0.1 || info "Swarm déjà ou impossible à init (mais on continue)"
fi

if [ "$RESTART_NEEDED" = true ] ; then
    info "Veuillez vous déconnecter et vous reconnecter (ou redémarrer) pour appliquer les permissions Docker, puis relancez ce script."
    exit 0
fi

info "Configuration de l'environnement..."
mkdir -p servers data logs monitoring_data

info "Installation des dépendances Python..."
if command -v pip3 &> /dev/null; then
    pip3 install -r requirements.txt || info "Certaines dépendances existent déjà"
else
    sudo apt-get install -y python3-pip
    pip3 install -r requirements.txt
fi

info "Démarrage des services via Docker Compose..."
# On lance le panel ET le monitoring
docker compose up -d
cd monitoring && docker compose up -d && cd ..

info "Installation terminée ! Accédez au panel sur http://localhost:5000"
info "Le monitoring est disponible sur http://localhost:3000 (Grafana)"

# Lancement du launcher local si possible (mode hybride)
if [ ! -z "$DISPLAY" ]; then
    info "Lancement du launcher graphique..."
    python3 desktop_launcher.py
else
    info "Serveur distant détecté, MCPanel tourne en tâche de fond dans Docker."
fi

