#!/usr/bin/env bash
set -euo pipefail

# Simple .deb builder for MCPanel (expects to be run from repo root)
# Produces dist/mcpanel_VERSION_amd64.deb

VERSION="1.0"
PKGNAME="mcpanel"
ARCH="amd64"
BUILD_DIR="build_deb"
OUT_DIR="dist"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/opt/$PKGNAME"
mkdir -p "$BUILD_DIR/usr/local/bin"
mkdir -p "$BUILD_DIR/usr/share/applications"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$OUT_DIR"

# Copy repository files to /opt/mcpanel (exclude heavy items)
rsync -a --exclude ".git" --exclude "dist" --exclude "__pycache__" --exclude "node_modules" ./ "$BUILD_DIR/opt/$PKGNAME/"

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

# desktop file
cp packaging/deb/mcpanel.desktop "$BUILD_DIR/usr/share/applications/"

# systemd service
mkdir -p "$BUILD_DIR/lib/systemd/system"
cp packaging/deb/mcpanel.service "$BUILD_DIR/lib/systemd/system/"

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

# Post-install script (enable service)
cp packaging/deb/DEBIAN/postinst "$BUILD_DIR/DEBIAN/"
cp packaging/deb/DEBIAN/prerm "$BUILD_DIR/DEBIAN/"
cp packaging/deb/DEBIAN/postrm "$BUILD_DIR/DEBIAN/"
chmod 755 "$BUILD_DIR/DEBIAN/postinst" "$BUILD_DIR/DEBIAN/prerm" "$BUILD_DIR/DEBIAN/postrm"

# Build deb
fakeroot dpkg-deb --build "$BUILD_DIR" "$OUT_DIR/${PKGNAME}_${VERSION}_${ARCH}.deb"

echo "Built $OUT_DIR/${PKGNAME}_${VERSION}_${ARCH}.deb"
