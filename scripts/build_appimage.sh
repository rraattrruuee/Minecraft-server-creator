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

# --- CORRECTION RSYNC (Race Condition Python 3.13) ---
# Utilisation de --ignore-missing-args pour éviter l'erreur sur les fichiers éphémères
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

# --- GESTION DES FICHIERS DESKTOP ET ICONE (REQUIS PAR APPIMAGE) ---
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

if [ -f app/static/img/default_icon.png ]; then
    cp app/static/img/default_icon.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/mcpanel.png"
    cp app/static/img/default_icon.png "$APPDIR/mcpanel.png"
else
    touch "$APPDIR/mcpanel.png"
fi

# AppRun launcher (indispensable)
cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/mcpanel" "$@"
EOF
chmod +x "$APPDIR/AppRun"

# Download appimagetool
APPIMAGETOOL=$BUILD/appimagetool-x86_64.AppImage
if [ ! -f "$APPIMAGETOOL" ]; then
    echo "Downloading appimagetool..."
    wget -q -O "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
    chmod +x "$APPIMAGETOOL"
fi

# Build
OUTFILE="$OUTDIR/${PKGNAME}-${VERSION}-x86_64.AppImage"
echo "Building AppImage..."
# --appimage-extract-and-run permet de fonctionner sans FUSE monté dans le runner
"$APPIMAGETOOL" --appimage-extract-and-run "$APPDIR" "$OUTFILE"

echo "Built $OUTFILE"