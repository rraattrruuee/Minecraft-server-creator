@echo off
echo >>> Installation Automatisée MCPanel Pro (Windows) <<<

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Docker n'est pas installe.
    echo     Veuillez installer Docker Desktop depuis https://www.docker.com/products/docker-desktop
    pause
    exit
)

echo [*] Lancement du Launcher...
pip install PyQt6 PyQt6-WebEngine requests
python desktop_launcher.py
pause
