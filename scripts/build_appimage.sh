#!/usr/bin/env bash
set -euo pipefail

PKGNAME=mcpanel
VERSION=1.0
OUTDIR=dist
BUILD=build_appimage
APPDIR=${BUILD}/${PKGNAME}.AppDir

# On définit explicitement l'architecture pour appimagetool
export ARCH=x86_64

rm -rf "$BUILD"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/opt/$PKGNAME"
mkdir -p "$APPDIR/usr/share/applications"
mkdir -p "$APPDIR/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$OUTDIR"

# --- CORRECTION RSYNC ---
rsync -a --ignore-missing-args \
    --exclude ".git" \
    --exclude "dist" \
    --exclude "build" \
    --exclude "build_deb" \
    --exclude "build_appimage" \
    --exclude "__pycache__" \
    --exclude "*.spec" \
    ./ "$APPDIR/opt/$PKGNAME/" || true

# Création du wrapper
cat > "$APPDIR/usr/bin/mcpanel" <<'EOF'
#!/usr/bin/env bash
HERE=$(dirname "$(readlink -f "$0")")
exec python3 "$HERE/../opt/mcpanel/main.py" "$@"
EOF
chmod +x "$APPDIR/usr/bin/mcpanel"

# --- GESTION DU FICHIER DESKTOP ---
# Correction de la catégorie pour éviter les avertissements (un seul "main category")
if [ -f packaging/deb/mcpanel.desktop ]; then
    cp packaging/deb/mcpanel.desktop "$APPDIR/usr/share/applications/"
    cp packaging/deb/mcpanel.desktop "$APPDIR/mcpanel.desktop"
else
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
if [ -f app/static/img/default_icon.png ]; then
    cp app/static/img/default_icon.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/mcpanel.png"
    cp app/static/img/default_icon.png "$APPDIR/mcpanel.png"
else
    touch "$APPDIR/mcpanel.png"
fi

# AppRun launcher
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
echo "Building AppImage for $ARCH..."
# On force ARCH ici aussi au cas où
ARCH=x86_64 "$APPIMAGETOOL" --appimage-extract-and-run "$APPDIR" "$OUTFILE"

echo "Built $OUTFILE"