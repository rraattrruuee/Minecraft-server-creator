#!/usr/bin/env python3
"""Reset le mot de passe de l'utilisateur `admin` dans la base SQLite.
Usage:
  python scripts/reset_admin_password.py newpassword

Ce script doit être exécuté localement et ne doit pas être exposé en production.
"""
import sys
from argon2 import PasswordHasher
from core.db import get_session, User

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: reset_admin_password.py <new-password>')
        sys.exit(2)
    new_pw = sys.argv[1]
    ph = PasswordHasher()
    s = get_session()
    try:
        admin = s.query(User).filter(User.username == 'admin').first()
        if not admin:
            print('Aucun utilisateur admin trouvé')
            sys.exit(1)
        admin.password_hash = ph.hash(new_pw)
        admin.needs_password_reset = False
        s.add(admin)
        s.commit()
        print('Mot de passe admin mis à jour avec succès')
    except Exception as e:
        print('Erreur:', e)
        s.rollback()
        sys.exit(1)
    finally:
        s.close()
