#!/usr/bin/env python3
"""Migrate users from data/users.json into the new SQLite DB.

Usage: python scripts/migrate_users.py
"""
import json
import os
import shutil
import sys

# Make script runnable whether invoked from repo root or not
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from core.db import init_db, get_session, User

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
USERS_FILE = os.path.join(BASE, 'data', 'users.json')


def migrate():
    if not os.path.exists(USERS_FILE):
        print('No users.json file found, nothing to migrate.')
        return

    init_db()
    session = get_session()
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    created = 0
    skipped = 0
    for username, info in data.items():
        if session.query(User).filter(User.username == username).first():
            print(f'Skipping existing user: {username}')
            skipped += 1
            continue

        pwd_hash = info.get('password_hash') or ''
        role = info.get('role', 'user')
        email = info.get('email', '')

        user = User(username=username, password_hash=pwd_hash, role=role, email=email)
        session.add(user)
        try:
            session.commit()
            created += 1
            print(f'Imported user: {username}')
        except Exception as e:
            session.rollback()
            print(f'Failed to import {username}: {e}')

    session.close()

    # backup original file
    bak = USERS_FILE + '.bak'
    shutil.copy2(USERS_FILE, bak)
    print(f'Migration completed. created={created}, skipped={skipped}. Backup: {bak}')


if __name__ == '__main__':
    migrate()
