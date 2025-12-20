import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.auth import AuthManager
from core.db import init_db, get_session, User
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta


def test_account_lockout_and_backoff():
    init_db()
    sess = get_session()
    username = 'lock_user'
    password = 'Secur3P@ss'

    # ensure clean
    existing = sess.query(User).filter(User.username == username).first()
    if existing:
        sess.delete(existing)
        sess.commit()

    # create user
    u = User(username=username, password_hash=generate_password_hash(password, method='scrypt'))
    sess.add(u)
    sess.commit()

    am = AuthManager()

    # Fail logins up to threshold
    for i in range(5):
        data, err = am.authenticate(username, 'wrongpassword')
        assert data is None
        assert err == 'Identifiants invalides.'

    # Next attempt should be locked
    data, err = am.authenticate(username, 'wrongpassword')
    assert data is None
    assert 'Compte verrouillé' in err

    # Check DB locked_until exists and is in future
    u = sess.query(User).filter(User.username == username).first()
    assert u.locked_until is not None
    assert u.locked_until > datetime.now()

    # Wait for a short time artificially: reduce locked_until to past to test successful login resets
    u.locked_until = datetime.now() - timedelta(seconds=1)
    sess.add(u)
    sess.commit()

    # Now login with correct password should succeed and clear counters
    data, err = am.authenticate(username, password)
    assert err is None
    refreshed = sess.query(User).filter(User.username == username).first()
    assert refreshed.failed_attempts == 0
    assert refreshed.locked_until is None

    # cleanup
    sess.delete(refreshed)
    sess.commit()
    sess.close()
