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

# Copy project into AppDir/opt/mcpanel
rsync -a --exclude ".git" --exclude "dist" --exclude "__pycache__" ./ "$APPDIR/opt/$PKGNAME/"

# Create wrapper
cat > "$APPDIR/usr/bin/mcpanel" <<'EOF'
#!/usr/bin/env bash
HERE=$(dirname "$(readlink -f "$0")")
# run the packaged python venv if present, otherwise try system python
if [ -x "$HERE/../opt/mcpanel/venv/bin/python" ]; then
  exec "$HERE/../opt/mcpanel/venv/bin/python" "$HERE/../opt/mcpanel/main.py" "$@"
else
  exec python3 "$HERE/../opt/mcpanel/main.py" "$@"
fi
EOF
chmod +x "$APPDIR/usr/bin/mcpanel"

# Desktop entry and icon
cp packaging/deb/mcpanel.desktop "$APPDIR/usr/share/applications/"
if [ -f app/static/img/default_icon.png ]; then
  cp app/static/img/default_icon.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/mcpanel.png"
fi

# Make sure AppRun exists for AppImage compatibility
cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/mcpanel" "$@"
EOF
chmod +x "$APPDIR/AppRun"

# Download appimagetool if necessary
APPIMAGETOOL=$BUILD/appimagetool-x86_64.AppImage
if [ ! -f "$APPIMAGETOOL" ]; then
  echo "Downloading appimagetool..."
  wget -q -O "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
  chmod +x "$APPIMAGETOOL"
fi

# Build AppImage
OUTFILE="$OUTDIR/${PKGNAME}-${VERSION}-x86_64.AppImage"
"$APPIMAGETOOL" "$APPDIR" "$OUTFILE"

echo "Built $OUTFILE"