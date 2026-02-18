import os
import sys
import zipfile
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.manager import ServerManager


def _make_jar_with_internal(path, jar_name, internal_name, internal_content=b"{}"):
    jar_path = os.path.join(path, jar_name)
    with zipfile.ZipFile(jar_path, 'w') as z:
        z.writestr(internal_name, internal_content)
    return jar_path


def test_detect_paper_by_plugins(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    srv = os.path.join(base, 'paper_srv')
    os.makedirs(os.path.join(srv, 'plugins'), exist_ok=True)
    open(os.path.join(srv, 'plugins', 'example-plugin.jar'), 'wb').close()

    assert mgr.detect_server_type('paper_srv') == 'paper'


def test_detect_fabric_by_mod_marker(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    srv = os.path.join(base, 'fabric_srv')
    os.makedirs(os.path.join(srv, 'mods'), exist_ok=True)
    # Create a jar that contains fabric.mod.json
    _make_jar_with_internal(os.path.join(srv, 'mods'), 'fabricmod.jar', 'fabric.mod.json', b'{"id":"ex"}')

    assert mgr.detect_server_type('fabric_srv') == 'fabric'


def test_detect_forge_by_jar_name(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    srv = os.path.join(base, 'forge_srv')
    os.makedirs(srv, exist_ok=True)
    open(os.path.join(srv, 'forge-1.20.1.jar'), 'wb').close()

    assert mgr.detect_server_type('forge_srv') == 'forge'


def test_prefer_paper_when_plugins_and_nonmarked_mods(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    srv = os.path.join(base, 'mixed_srv')
    os.makedirs(os.path.join(srv, 'mods'), exist_ok=True)
    os.makedirs(os.path.join(srv, 'plugins'), exist_ok=True)
    # mods contains a jar without mod markers
    open(os.path.join(srv, 'mods', 'unknown.jar'), 'wb').close()
    # plugins contains a normal plugin
    open(os.path.join(srv, 'plugins', 'plugin.jar'), 'wb').close()

    assert mgr.detect_server_type('mixed_srv') == 'paper'


def test_detect_quilt_from_mod_marker(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    srv = os.path.join(base, 'quilt_srv')
    os.makedirs(os.path.join(srv, 'mods'), exist_ok=True)
    _make_jar_with_internal(os.path.join(srv, 'mods'), 'quiltmod.jar', 'quilt.mod.json', b'{"id":"q"}')

    assert mgr.detect_server_type('quilt_srv') == 'quilt'
