#!/usr/bin/env bash
set -euo pipefail

PKGNAME=mcpanel
VERSION=0.2.5
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

# --- RSYNC ---
rsync -a --ignore-missing-args \
    --exclude ".git" \
    --exclude "dist" \
    --exclude "build" \
    --exclude "build_deb" \
    --exclude "build_appimage" \
    --exclude "__pycache__" \
    --exclude "*.spec" \
    ./ "$APPDIR/opt/$PKGNAME/" || true

# Wrapper
cat > "$APPDIR/usr/bin/mcpanel" <<'EOF'
#!/usr/bin/env bash
HERE=$(dirname "$(readlink -f "$0")")
exec python3 "$HERE/../opt/mcpanel/main.py" "$@"
EOF
chmod +x "$APPDIR/usr/bin/mcpanel"

# --- FIX DESKTOP FILE ---
# On crée un fichier .desktop propre à la racine pour AppImage
cat > "$APPDIR/mcpanel.desktop" <<EOF
[Desktop Entry]
Name=MCPanel
Exec=mcpanel
Icon=mcpanel
Type=Application
Categories=Utility;
Terminal=false
EOF
cp "$APPDIR/mcpanel.desktop" "$APPDIR/usr/share/applications/"

# --- FIX ICON ---
# On s'assure que l'icône s'appelle "mcpanel.png" (sans chemin complexe)
ICON_SRC="app/static/img/default_icon.png"
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$APPDIR/mcpanel.png"
    cp "$ICON_SRC" "$APPDIR/usr/share/icons/hicolor/512x512/apps/mcpanel.png"
else
    # Fallback au cas où l'icône n'existe pas pour ne pas crash le build
    touch "$APPDIR/mcpanel.png"
fi

# AppRun launcher
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
ARCH=x86_64 "$APPIMAGETOOL" --appimage-extract-and-run "$APPDIR" "$OUTFILE"

echo "Built $OUTFILE"