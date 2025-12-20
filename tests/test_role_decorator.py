import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from core.auth import role_required
from flask import session


# Register test routes early (before any request) to avoid Flask setup assertion
@app.route('/__test/role_nonapi')
@role_required('admin')
def _nonapi():
    return 'ok'


@app.route('/api/__test/role_api')
@role_required('admin')
def _api():
    return 'ok'


@app.route('/api/__test/role_api2')
@role_required(['admin', 'manager'])
def _api2():
    return 'ok'


@app.route('/api/__test/allow_admin')
@role_required('admin')
def _allow_admin():
    return 'ok'


def test_role_required_redirects_when_not_logged_in():
    client = app.test_client()
    resp = client.get('/__test/role_nonapi')
    # Expect redirect to login
    assert resp.status_code == 302


def test_role_required_returns_401_for_api_when_not_logged_in():
    client = app.test_client()
    resp = client.get('/api/__test/role_api')
    assert resp.status_code == 401
    assert resp.is_json
    assert resp.get_json().get('message') == 'Not authenticated'


def test_role_required_forbidden_for_insufficient_role():
    client = app.test_client()
    # set session user with role 'user'
    with client.session_transaction() as sess:
        sess['user'] = {'username': 'bob', 'role': 'user'}

    resp = client.get('/api/__test/role_api2')
    assert resp.status_code == 403
    assert resp.is_json
    assert resp.get_json().get('message') == 'Forbidden'


def test_role_required_allows_admin():
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['user'] = {'username': 'admin', 'role': 'admin'}

    resp = client.get('/api/__test/allow_admin')
    assert resp.status_code == 200
    assert resp.get_data(as_text=True) == 'ok'
