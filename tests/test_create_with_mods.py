import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app


def test_create_server_with_mods(monkeypatch, tmp_path):
    client = app.test_client()

    # Simulate logged-in admin
    with client.session_transaction() as sess:
        sess['user'] = {'username': 'admin', 'role': 'admin'}

    created = {}

    def fake_create(name, version, **kwargs):
        # create server folder
        base = str(tmp_path)
        server_path = os.path.join(base, name)
        os.makedirs(server_path, exist_ok=True)
        os.makedirs(os.path.join(server_path, 'mods'), exist_ok=True)
        created['server'] = server_path
        return True

    def fake_install(srv_name, project_id, version_id=None, loader=None, mc_version=None):
        # simulate successful install
        return {"success": True, "filename": f"{project_id}.jar", "version": version_id or "latest"}

    # Monkeypatch srv_mgr.create_server and mod_mgr.install
    monkeypatch.setattr('main.srv_mgr.create_server', fake_create)
    monkeypatch.setattr('main.mod_mgr.install', fake_install)
    # Ensure compatibility check passes for examplemod
    def fake_get_mod_versions(project_id, loader=None, mc_version=None):
        if project_id == 'examplemod':
            return [{"id": "abc123", "version_number": "1.0"}]
        if project_id == 'jei':
            return [{"id": "jei_v", "version_number": "1.0"}]
        return []
    monkeypatch.setattr('main.mod_mgr.get_mod_versions', fake_get_mod_versions)

    payload = {
        "name": "mods_server",
        "version": "1.20.1",
        "server_type": "forge",
        "forge_version": "1.20.1-47.1.0",
        "mods": [
            {"project_id": "jei"},
            {"project_id": "examplemod", "version_id": "abc123"}
        ]
    }

    # get CSRF token for authenticated POST
    token_resp = client.get('/api/csrf-token')
    token = token_resp.get_json().get('csrf_token')
    payload['_csrf_token'] = token

    resp = client.post('/api/create', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'success'
    assert 'mods' in data
    assert len(data['mods']) == 2
    assert data['mods'][0]['success'] is True
    assert data['mods'][1]['success'] is True


def test_mods_compatible_endpoint(monkeypatch):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['user'] = {'username': 'admin', 'role': 'admin'}

    def fake_versions(project_id, loader=None, mc_version=None):
        return [
            {"id": "v1", "version_number": "1.0"},
            {"id": "v2", "version_number": "2.0"}
        ]

    monkeypatch.setattr('main.mod_mgr.get_mod_versions', fake_versions)

    resp = client.get('/api/mods/compatible?project_id=jei&loader=forge&version=1.20.1')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'success'
    assert isinstance(data['versions'], list)