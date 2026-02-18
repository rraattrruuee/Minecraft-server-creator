"""Migre les utilisateurs stockés dans `data/users.json` vers la table `users` (SQLite).

Le fichier attendu est un JSON de la forme:
{
  "username": {"password_hash": "...", "role": "user", "email": ""},
  ...
}

Le script crée une sauvegarde `<users.json>.bak` après import.
"""
import json
import os
from werkzeug.security import generate_password_hash

from core.db import get_session, init_db, User

# Chemin utilisable par les tests (monkeypatchable)
USERS_FILE = os.path.join('data', 'users.json')


def migrate():
    """Importer les utilisateurs depuis USERS_FILE vers la base SQLAlchemy.

    Retourne le nombre d'utilisateurs importés.
    """
    if not os.path.exists(USERS_FILE):
        return 0

    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        try:
            users = json.load(f)
        except Exception:
            return 0

    init_db()
    session = get_session()
    imported = 0
    try:
        for username, info in (users or {}).items():
            if not username:
                continue
            # skip if already exists
            exists = session.query(User).filter(User.username == username).first()
            if exists:
                continue

            pwd_hash = info.get('password_hash') or generate_password_hash(info.get('password', ''))
            role = info.get('role', 'user')
            email = info.get('email', '')

            u = User(username=username, password_hash=pwd_hash, role=role, email=email)
            session.add(u)
            imported += 1

        session.commit()

        # create backup
        bak = USERS_FILE + '.bak'
        try:
            os.replace(USERS_FILE, bak)
        except Exception:
            # best-effort: try copy
            try:
                with open(bak, 'w', encoding='utf-8') as bf:
                    json.dump(users, bf)
                os.remove(USERS_FILE)
            except Exception:
                pass

        return imported
    except Exception:
        try:
            session.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == '__main__':
    n = migrate()
    print(f"Imported {n} users")
