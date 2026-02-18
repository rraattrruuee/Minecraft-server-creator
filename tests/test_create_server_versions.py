import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.manager import ServerManager


def test_create_server_with_forge_version(tmp_path, monkeypatch):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    called = {}

    def fake_download(self, path, mc_version, forge_version):
        called['args'] = (path, mc_version, forge_version)
        # simulate server jar creation
        os.makedirs(path, exist_ok=True)
        open(os.path.join(path, 'server.jar'), 'wb').close()
        return True

    # prevent java download
    monkeypatch.setattr(ServerManager, 'ensure_java_for_version', lambda self, v: 'java')
    monkeypatch.setattr(ServerManager, 'download_forge_server', fake_download)

    mgr.create_server('testforge', '1.20.1', server_type='forge', forge_version='1.20.1-47.1.0', owner='bob')

    server_path = os.path.join(base, 'testforge')
    assert os.path.exists(os.path.join(server_path, 'server.jar'))
    assert called['args'][2] == '1.20.1-47.1.0'


def test_create_server_with_fabric_loader(tmp_path, monkeypatch):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    called = {}

    def fake_download(self, path, mc_version, loader_version):
        called['args'] = (path, mc_version, loader_version)
        os.makedirs(path, exist_ok=True)
        open(os.path.join(path, 'server.jar'), 'wb').close()
        return True

    monkeypatch.setattr(ServerManager, 'ensure_java_for_version', lambda self, v: 'java')
    monkeypatch.setattr(ServerManager, 'download_fabric_server', fake_download)

    mgr.create_server('testfabric', '1.20.1', server_type='fabric', loader_version='0.18.3', owner='alice')

    server_path = os.path.join(base, 'testfabric')
    assert os.path.exists(os.path.join(server_path, 'server.jar'))
    assert called['args'][2] == '0.18.3'


def test_create_server_allows_reuse_of_stale_directory(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    # create a stale directory that does NOT contain server markers
    stale_dir = os.path.join(base, 'stale_server')
    os.makedirs(stale_dir, exist_ok=True)
    # add an unrelated file
    with open(os.path.join(stale_dir, 'README.txt'), 'w') as f:
        f.write('not a server')

    # should not raise and should create manager_config.json
    mgr.create_server('stale_server', '1.20.1', owner='bob')
    cfg_path = os.path.join(stale_dir, 'manager_config.json')
    assert os.path.exists(cfg_path)


def test_create_server_rejects_existing_server_dir(tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    # create a directory that looks like an existing server
    srv = os.path.join(base, 'exists_server')
    os.makedirs(srv, exist_ok=True)
    with open(os.path.join(srv, 'manager_config.json'), 'w') as f:
        f.write('{}')

    try:
        mgr.create_server('exists_server', '1.20.1', owner='bob')
        raised = False
    except Exception as e:
        raised = True
        assert 'Ce nom existe déjà' in str(e)
    assert raised
