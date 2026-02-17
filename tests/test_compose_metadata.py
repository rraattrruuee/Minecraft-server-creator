import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.manager import ServerManager
import yaml


def _write_compose(path, env):
    data = {
        'version': '3.8',
        'services': {
            'mc': {
                'image': 'ghcr.io/example/mc',
                'environment': env
            }
        }
    }
    with open(path, 'w', encoding='utf-8') as f:
        yaml.safe_dump(data, f)


def test_read_compose_metadata_dict_env(tmp_path):
    base = str(tmp_path)
    name = 'srv1'
    srv = os.path.join(base, name)
    os.makedirs(srv, exist_ok=True)

    env = {'VERSION': '1.20.2', 'TYPE': 'FABRIC', 'FABRIC_LOADER_VERSION': '0.18.3'}
    _write_compose(os.path.join(srv, 'docker-compose.yml'), env)

    mgr = ServerManager(base_dir=base)
    meta = mgr.get_compose_metadata(name)
    assert meta['version'] == '1.20.2'
    assert meta['server_type'] == 'fabric'
    assert meta['loader_version'] == '0.18.3'


def test_read_compose_metadata_list_env(tmp_path):
    base = str(tmp_path)
    name = 'srv2'
    srv = os.path.join(base, name)
    os.makedirs(srv, exist_ok=True)

    env = ['VERSION=1.19.4', 'TYPE=PAPER']
    _write_compose(os.path.join(srv, 'docker-compose.yml'), env)

    mgr = ServerManager(base_dir=base)
    meta = mgr.get_compose_metadata(name)
    assert meta['version'] == '1.19.4'
    assert meta['server_type'] == 'paper'


def test_detect_server_type_prefers_compose(tmp_path):
    base = str(tmp_path)
    name = 'srv3'
    srv = os.path.join(base, name)
    os.makedirs(srv, exist_ok=True)

    # even if there are plugin files, compose TYPE=forge should win
    os.makedirs(os.path.join(srv, 'plugins'), exist_ok=True)
    with open(os.path.join(srv, 'plugins', 'p.jar'), 'wb') as _:
        pass
    env = {'VERSION': '1.18.2', 'TYPE': 'FORGE', 'FORGE_VERSION': '1.18.2-40.1.0'}
    _write_compose(os.path.join(srv, 'docker-compose.yml'), env)

    mgr = ServerManager(base_dir=base)
    stype = mgr.detect_server_type(name)
    assert stype == 'forge'