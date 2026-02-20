# Utilisation de Python Slim pour la légèreté
FROM python:3.12-slim

# Eviter les fichiers .pyc
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Installation des dépendances système (git pour LFS, docker pour le pilotage)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    docker.io \
    docker-compose \
    iputils-ping \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libwebp-dev \
    tcl-dev \
    tk-dev \
    && rm -rf /var/lib/apt/lists/*

# Création du dossier de travail
WORKDIR /app

# Copie des requirements
COPY requirements.txt .

# Installation des dépendances Python
# On modifie PyQt6/WebEngine pour qu'ils ne soient pas installés dans le conteneur serveur (headless)
# pour économiser de l'espace, sauf si spécifiquement demandé.
# Ici, on installe tout sauf l'interface graphique lourde qui tournera côté client.
RUN sed -i '/PyQt6/d' requirements.txt \
 && python -m pip install --upgrade pip setuptools wheel \
 && pip install --prefer-binary --no-cache-dir -r requirements.txt

# Copie du code source
COPY . .

# Création des dossiers de données nécessaires
RUN mkdir -p servers data logs .pipk_venv

# Exposition du port
EXPOSE 5000

# Commande de démarrage (le launcher détectera qu'il n'y a pas de display et lancera Flask direct)
CMD ["python", "main.py"]
