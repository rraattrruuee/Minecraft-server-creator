import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pyotp
from core.db import init_db, get_session, User
from core.auth import AuthManager
from werkzeug.security import generate_password_hash


def test_2fa_enable_and_login_flow():
    init_db()
    sess = get_session()
    username = 'u2fa'
    password = 'Passw0rd!'

    # create user
    existing = sess.query(User).filter(User.username == username).first()
    if existing:
        sess.delete(existing)
        sess.commit()
    u = User(username=username, password_hash=generate_password_hash(password, method='scrypt'))
    sess.add(u)
    sess.commit()

    am = AuthManager()
    # Start: generate secret
    secret, uri = am.generate_2fa_secret(username)
    totp = pyotp.TOTP(secret)
    code = totp.now()

    # Confirm enabling
    ok, msg = am.enable_2fa(username, secret, code)
    assert ok

    # Login without OTP should return 2FA_REQUIRED
    data, err = am.authenticate(username, password)
    assert data is None
    assert err == '2FA_REQUIRED'

    # Login with wrong OTP
    data, err = am.authenticate(username, password, otp='000000')
    assert data is None
    assert err == 'Code 2FA invalide'

    # Login with correct OTP
    code = pyotp.TOTP(secret).now()
    data, err = am.authenticate(username, password, otp=code)
    assert err is None
    assert data['username'] == username

    # disable 2FA (verify password+code)
    code = pyotp.TOTP(secret).now()
    ok, msg = am.disable_2fa(username, password, code)
    assert ok

    # cleanup
    sess.delete(sess.query(User).filter(User.username == username).first())
    sess.commit()
    sess.close()


def test_password_reset_flow():
    init_db()
    sess = get_session()
    username = 'ureset'
    password = 'Initial1!'
    new_password = 'NewPass2!'

    existing = sess.query(User).filter(User.username == username).first()
    if existing:
        sess.delete(existing)
        sess.commit()
    u = User(username=username, password_hash=generate_password_hash(password, method='scrypt'))
    sess.add(u)
    sess.commit()

    am = AuthManager()
    ok, token = am.request_password_reset(username)
    assert ok
    assert token

    # Reset with invalid token
    ok, msg = am.reset_password(username, 'wrongtoken', new_password)
    assert not ok

    # Reset with correct token
    ok, msg = am.reset_password(username, token, new_password)
    assert ok
    # Login with new password
    data, err = am.authenticate(username, new_password)
    assert err is None
    assert data['username'] == username

    # cleanup
    sess.delete(sess.query(User).filter(User.username == username).first())
    sess.commit()
    sess.close()
