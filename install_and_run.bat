@echo off
setlocal enabledelayedexpansion
echo >>> Installation Automatisée MCPanel Pro (Windows) <<<

:: Vérification des privilèges admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Ce script doit être exécuté en tant qu'Administrateur pour installer Docker.
    echo     Relancez le script avec un clic droit 'Exécuter en tant qu'administrateur'.
    pause
    exit /b
)

:: Vérification Docker
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Docker n'est pas installe. Tentative d'installation via winget...
    winget install --id Docker.DockerDesktop --quiet --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [!] L'installation automatique a echoue. 
        echo     Veuillez installer Docker Desktop manuellement depuis https://www.docker.com/products/docker-desktop
        pause
        exit /b
    )
    echo [OK] Docker Desktop est en cours d'installation. 
    echo      NOTE : Un redémarrage système peut être nécessaire pour terminer l'installation de WSL2 et Docker.
)

:: Vérification Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Python n'est pas installe. Installation via winget...
    winget install --id Python.Python.3.11 --quiet --accept-package-agreements
    echo [!] Python installe. Veuillez relancer ce terminal pour charger le PATH.
    pause
    exit /b
)

echo [*] Verification des dependances Python...
python -m pip install --upgrade pip
python -m pip install PyQt6 PyQt6-WebEngine requests Flask flask-socketio psutil docker python-dotenv alembic SQLAlchemy cryptography

echo [*] Lancement du Launcher...
python desktop_launcher.py
pause

