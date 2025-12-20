import os
import sys
import tempfile

# ensure repo root on path for imports during pytest
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.db import get_session, init_db, User
from core.auth import AuthManager
from werkzeug.security import generate_password_hash


def test_legacy_user_rehash_on_login():
    # Ensure DB initialized
    init_db()
    sess = get_session()
    username = 'legacy_user'
    password = 'LegacyP4ssw0rd'

    # Create a user with a legacy scrypt hash and mark needs_password_reset
    legacy_hash = generate_password_hash(password, method='scrypt')
    u = sess.query(User).filter(User.username == username).first()
    if u:
        sess.delete(u)
        sess.commit()

    user = User(username=username, password_hash=legacy_hash, role='user')
    user.needs_password_reset = True
    sess.add(user)
    sess.commit()

    am = AuthManager()
    data, err = am.authenticate(username, password)
    assert err is None
    assert data['username'] == username

    # verify user is re-hashed to Argon2 and flag cleared
    refreshed = sess.query(User).filter(User.username == username).first()
    assert refreshed.password_hash.startswith('$argon2')
    assert refreshed.needs_password_reset is False

    # cleanup
    sess.delete(refreshed)
    sess.commit()
    sess.close()
