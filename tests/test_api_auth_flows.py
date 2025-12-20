import os
import sys
import json
import tempfile
import shutil

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from core.db import get_session, init_db, User
from werkzeug.security import generate_password_hash
import scripts.migrate_users as mig


def test_scripts_migrate_users(tmp_path, monkeypatch):
    # Create a fake users.json file
    users = {
        "miguser": {
            "password_hash": generate_password_hash('MigPass1', method='scrypt'),
            "role": "user",
            "email": ""
        }
    }
    tmpfile = tmp_path / "users.json"
    tmpfile.write_text(json.dumps(users))

    # Point the script to the temp file
    monkeypatch.setattr(mig, 'USERS_FILE', str(tmpfile))

    # Ensure DB empty
    init_db()
    s = get_session()
    exists = s.query(User).filter(User.username == 'miguser').first()
    if exists:
        s.delete(exists)
        s.commit()

    # Run migration
    mig.migrate()

    # Check user created in DB
    u = s.query(User).filter(User.username == 'miguser').first()
    assert u is not None

    # Backup created
    bak = str(tmpfile) + '.bak'
    assert os.path.exists(bak)
    s.delete(u)
    s.commit()
    s.close()


def test_api_password_reset_and_login():
    init_db()
    client = app.test_client()

    # create user via direct DB
    s = get_session()
    username = 'api_reset'
    s.query(User).filter(User.username == username).delete()
    s.commit()
    u = User(username=username, password_hash=generate_password_hash('OldPass1', method='scrypt'))
    s.add(u)
    s.commit()

    # Request password reset
    # CSRF token required for POSTs other than login/register/csrf-token
    csrf = client.get('/api/csrf-token').get_json().get('csrf_token')
    resp = client.post('/api/auth/password/request-reset', json={'username': username}, headers={'X-CSRF-Token': csrf})
    assert resp.status_code == 200
    data = resp.get_json()
    token = data.get('token')
    assert token

    # Reset with token
    csrf = client.get('/api/csrf-token').get_json().get('csrf_token')
    resp = client.post('/api/auth/password/reset', json={'username': username, 'token': token, 'new_password': 'NewP@ss2'}, headers={'X-CSRF-Token': csrf})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'success'

    # Login with new password
    resp = client.post('/api/auth/login', json={'username': username, 'password': 'NewP@ss2'})
    assert resp.status_code == 200
    j = resp.get_json()
    assert j['status'] == 'success'

    # cleanup
    s.delete(s.query(User).filter(User.username == username).first())
    s.commit()
    s.close()


def test_api_2fa_endpoints():
    init_db()
    client = app.test_client()

    s = get_session()
    username = 'api_2fa'
    s.query(User).filter(User.username == username).delete()
    s.commit()
    u = User(username=username, password_hash=generate_password_hash('MyPass1', method='scrypt'))
    s.add(u)
    s.commit()

    # Login to create session
    resp = client.post('/api/auth/login', json={'username': username, 'password': 'MyPass1'})
    assert resp.status_code == 200

    # Start 2FA
    # After login we must fetch CSRF token and include it in header
    csrf = client.get('/api/csrf-token').get_json().get('csrf_token')
    resp = client.post('/api/auth/2fa/start', headers={'X-CSRF-Token': csrf})
    assert resp.status_code == 200
    data = resp.get_json()
    secret = data['secret']
    assert secret

    # Confirm 2FA by providing valid code
    import pyotp
    code = pyotp.TOTP(secret).now()
    resp = client.post('/api/auth/2fa/confirm', json={'secret': secret, 'code': code}, headers={'X-CSRF-Token': csrf})
    assert resp.status_code == 200

    # Logout
    client.get('/logout')

    # Login without OTP -> 401 with 2FA_REQUIRED
    resp = client.post('/api/auth/login', json={'username': username, 'password': 'MyPass1'})
    assert resp.status_code == 401
    j = resp.get_json()
    assert j['message'] == '2FA_REQUIRED'

    # Login with OTP
    code = pyotp.TOTP(secret).now()
    resp = client.post('/api/auth/login', json={'username': username, 'password': 'MyPass1', 'otp': code})
    assert resp.status_code == 200
    j = resp.get_json()
    assert j['status'] == 'success'

    # cleanup
    s.delete(s.query(User).filter(User.username == username).first())
    s.commit()
    s.close()
