#!/usr/bin/env bash
# install_docker_linux.sh
# Script idempotent pour installer Docker Engine (Debian/Ubuntu/CentOS/RHEL)
# Usage: sudo bash scripts/install_docker_linux.sh  (exige les droits root)

set -euo pipefail
LOG_DIR="$(dirname "$0")/docker-install-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-linux-install.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[INSTALLER] Début installation Docker (linux)"

if command -v docker >/dev/null 2>&1; then
  echo "[INSTALLER] Docker déjà installé : $(docker --version)"
  exit 0
fi

if [ "$EUID" -ne 0 ]; then
  echo "[ERROR] Ce script doit être exécuté en root (sudo)" >&2
  exit 2
fi

# Détection du gestionnaire de paquets
if command -v apt-get >/dev/null 2>&1; then
  DIST=debian
  echo "[INSTALLER] Détection APT-based distro"
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release; echo "$ID") \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io
  systemctl enable --now docker || true
  echo "[INSTALLER] Docker installé avec apt"
  exit 0

elif command -v yum >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1; then
  DIST=rhel
  echo "[INSTALLER] Détection YUM/DNF-based distro"
  if command -v yum >/dev/null 2>&1; then
    PKG_MGR=yum
  else
    PKG_MGR=dnf
  fi
  $PKG_MGR install -y yum-utils
  yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
  $PKG_MGR install -y docker-ce docker-ce-cli containerd.io
  systemctl enable --now docker || true
  echo "[INSTALLER] Docker installé avec $PKG_MGR"
  exit 0
else
  echo "[ERROR] Gestionnaire de paquets non supporté. Installez Docker manuellement." >&2
  exit 3
fi
