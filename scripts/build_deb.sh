#!/usr/bin/env bash
set -euo pipefail

# Simple .deb builder for MCPanel (expects to be run from repo root)
VERSION="0.2.5"
PKGNAME="mcpanel"
ARCH="amd64"
BUILD_DIR="build_deb"
OUT_DIR="dist"

# Nettoyage propre
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/opt/$PKGNAME"
mkdir -p "$BUILD_DIR/usr/local/bin"
mkdir -p "$BUILD_DIR/usr/share/applications"
# AJOUT : Dossier pour l'icône système
mkdir -p "$BUILD_DIR/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$OUT_DIR"

# Copy repository files to /opt/mcpanel
rsync -a --ignore-missing-args \
    --exclude ".git" \
    --exclude "dist" \
    --exclude "build" \
    --exclude "build_deb" \
    --exclude "build_appimage" \
    --exclude "__pycache__" \
    --exclude "node_modules" \
    ./ "$BUILD_DIR/opt/$PKGNAME/" || true

# Gestion de l'icône pour le menu K (Kubuntu)
# On la copie dans le standard Linux pour qu'elle soit trouvée par Icon=mcpanel
ICON_SRC="app/static/img/default_icon.png"
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$BUILD_DIR/usr/share/icons/hicolor/512x512/apps/mcpanel.png"
fi

# Install wrapper
cat > "$BUILD_DIR/usr/local/bin/mcpanel" <<'EOF'
#!/usr/bin/env bash
# Wrapper to launch MCPanel from system PATH
cd /opt/mcpanel || exit 1
# Create venv if missing
if [ ! -d venv ]; then
  python3 -m venv venv
  . venv/bin/activate
  pip install --upgrade pip
  if [ -f requirements.txt ]; then
    pip install -r requirements.txt
  fi
else
  . venv/bin/activate
fi
# Run the app
python3 main.py "$@"
EOF
chmod +x "$BUILD_DIR/usr/local/bin/mcpanel"

# Desktop file
# On s'assure que le .desktop utilise l'icône "mcpanel" sans chemin absolu
cp packaging/deb/mcpanel.desktop "$BUILD_DIR/usr/share/applications/"
sed -i 's|^Icon=.*|Icon=mcpanel|' "$BUILD_DIR/usr/share/applications/mcpanel.desktop"

# systemd service
mkdir -p "$BUILD_DIR/lib/systemd/system"
if [ -f packaging/deb/mcpanel.service ]; then
    cp packaging/deb/mcpanel.service "$BUILD_DIR/lib/systemd/system/"
fi

# DEBIAN control
cat > "$BUILD_DIR/DEBIAN/control" <<EOF
Package: $PKGNAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: python3 (>= 3.8), python3-venv, python3-pip
Maintainer: MCPanel Team <dev@example.com>
Description: MCPanel - Minecraft server manager
 A simple Minecraft server manager web interface.
EOF

# Scripts de maintenance (postinst, etc.)
# Utilisation de find pour copier seulement s'ils existent
for f in postinst prerm postrm; do
    if [ -f "packaging/deb/DEBIAN/$f" ]; then
        cp "packaging/deb/DEBIAN/$f" "$BUILD_DIR/DEBIAN/"
        chmod 755 "$BUILD_DIR/DEBIAN/$f"
    fi
done

# Build deb
fakeroot dpkg-deb --build "$BUILD_DIR" "$OUT_DIR/${PKGNAME}_${VERSION}_${ARCH}.deb"

echo "Built $OUT_DIR/${PKGNAME}_${VERSION}_${ARCH}.deb"