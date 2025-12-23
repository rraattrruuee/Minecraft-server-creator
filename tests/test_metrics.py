import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app


def _login_as_admin(client):
    with client.session_transaction() as sess:
        sess['user'] = {'username': 'admin', 'role': 'admin'}


def test_metrics_history_and_system_endpoints():
    client = app.test_client()
    _login_as_admin(client)

    # metrics history should return status and data list
    r = client.get('/api/metrics/history?limit=10')
    assert r.status_code == 200
    payload = r.get_json()
    assert isinstance(payload, dict)
    assert payload.get('status') == 'success'
    assert isinstance(payload.get('data'), list)

    # current metrics should contain cpu and memory keys
    r2 = client.get('/api/metrics/system')
    assert r2.status_code == 200
    current = r2.get_json()
    assert isinstance(current, dict)
    assert 'cpu' in current and 'memory' in current
    assert 'percent' in current['cpu'] or 'percent' in current['memory']
