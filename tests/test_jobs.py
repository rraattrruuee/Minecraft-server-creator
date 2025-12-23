import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app


def test_jobs_install_mods(monkeypatch, tmp_path):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['user'] = {'username': 'admin', 'role': 'admin'}

    # create dummy server
    server_name = 'jobserver'
    base = str(tmp_path)
    server_path = os.path.join(base, server_name)
    os.makedirs(os.path.join(server_path, 'mods'), exist_ok=True)

    # monkeypatch mod_mgr.install
    def fake_install(srv_name, project_id, version_id=None, loader=None, mc_version=None):
        return {"success": True, "filename": f"{project_id}.jar"}

    monkeypatch.setattr('main.mod_mgr.install', fake_install)

    payload = {
        "server_name": server_name,
        "mods": [{"project_id": "jei"}, {"project_id": "examplemod", "version_id": "abc123"}],
        "loader": "forge",
        "mc_version": "1.20.1"
    }

    # provide csrf token
    token = client.get('/api/csrf-token').get_json()['csrf_token']
    payload['_csrf_token'] = token

    resp = client.post('/api/jobs/install-mods', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'success'
    job_id = data['job_id']

    # poll job until completed
    import time
    for _ in range(50):
        r = client.get(f'/api/jobs/{job_id}')
        assert r.status_code == 200
        j = r.get_json()['job']
        if j['status'] in ('completed', 'failed', 'cancelled'):
            break
        time.sleep(0.05)
    assert j['status'] == 'completed'

    # get logs
    r = client.get(f'/api/jobs/{job_id}/logs')
    assert r.status_code == 200
    logs = r.get_json()['logs']
    assert any('Installed' in l or 'Installed' in l for l in logs)