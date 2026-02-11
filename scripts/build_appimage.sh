#!/usr/bin/env bash
set -euo pipefail

PKGNAME=mcpanel
VERSION=1.0
OUTDIR=dist
BUILD=build_appimage
APPDIR=${BUILD}/${PKGNAME}.AppDir

rm -rf "$BUILD"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/opt/$PKGNAME"
mkdir -p "$APPDIR/usr/share/applications"
mkdir -p "$APPDIR/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$OUTDIR"

# Copie des fichiers du projet
rsync -a --exclude ".git" --exclude "dist" --exclude "__pycache__" ./ "$APPDIR/opt/$PKGNAME/"

# Création du wrapper
cat > "$APPDIR/usr/bin/mcpanel" <<'EOF'
#!/usr/bin/env bash
HERE=$(dirname "$(readlink -f "$0")")
# Utilise le python du système (le binaire PyInstaller est déjà compilé ou on lance via main.py)
exec python3 "$HERE/../opt/mcpanel/main.py" "$@"
EOF
chmod +x "$APPDIR/usr/bin/mcpanel"

# --- GESTION DU FICHIER DESKTOP ---
# AppImage exige un fichier .desktop à la racine de l'AppDir
if [ -f packaging/deb/mcpanel.desktop ]; then
    cp packaging/deb/mcpanel.desktop "$APPDIR/usr/share/applications/"
    cp packaging/deb/mcpanel.desktop "$APPDIR/mcpanel.desktop"
else
    # Génération d'un fichier .desktop par défaut si manquant
    cat > "$APPDIR/mcpanel.desktop" <<EOF
[Desktop Entry]
Name=MCPanel
Exec=mcpanel
Icon=mcpanel
Type=Application
Categories=Utility;
EOF
    cp "$APPDIR/mcpanel.desktop" "$APPDIR/usr/share/applications/"
fi

# --- GESTION DE L'ICÔNE ---
# AppImage exige une icône à la racine de l'AppDir
if [ -f app/static/img/default_icon.png ]; then
    cp app/static/img/default_icon.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/mcpanel.png"
    cp app/static/img/default_icon.png "$APPDIR/mcpanel.png"
else
    # Création d'une icône vide pour éviter le crash d'appimagetool
    touch "$APPDIR/mcpanel.png"
fi

# AppRun launcher (indispensable à la racine)
cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/mcpanel" "$@"
EOF
chmod +x "$APPDIR/AppRun"

# Téléchargement de appimagetool
APPIMAGETOOL=$BUILD/appimagetool-x86_64.AppImage
if [ ! -f "$APPIMAGETOOL" ]; then
    echo "Downloading appimagetool..."
    wget -q -O "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
    chmod +x "$APPIMAGETOOL"
fi

# Build de l'AppImage
OUTFILE="$OUTDIR/${PKGNAME}-${VERSION}-x86_64.AppImage"
echo "Building AppImage..."
# --appimage-extract-and-run est crucial pour les environnements sans FUSE (Docker/GitHub Actions)
"$APPIMAGETOOL" --appimage-extract-and-run "$APPDIR" "$OUTFILE"

echo "Built $OUTFILE"