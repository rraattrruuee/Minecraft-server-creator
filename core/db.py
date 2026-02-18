from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, func
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.ext.declarative import declared_attr
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB_PATH = os.getenv('MCPANEL_DB', os.path.join(BASE_DIR, 'data', 'mcpanel.db'))
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class TimestampMixin:
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class User(Base, TimestampMixin):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(512), nullable=False)
    role = Column(String(50), default='user', index=True)
    email = Column(String(255), default='')
    last_login = Column(DateTime, nullable=True)
    discord_webhook = Column(String(255), default='')
    disabled = Column(Boolean, default=False)
    default_password_changed = Column(Boolean, default=False)
    # Account lockout fields
    failed_attempts = Column(Integer, default=0)
    last_failed_at = Column(DateTime, nullable=True)
    locked_until = Column(DateTime, nullable=True)
    # 2FA and password reset
    totp_secret = Column(String(128), nullable=True)
    totp_enabled = Column(Boolean, default=False)
    reset_token = Column(String(128), nullable=True)
    reset_expires = Column(DateTime, nullable=True)
    # Mark accounts whose password hash is old (scrypt/pbkdf2/legacy) and need a reset
    needs_password_reset = Column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime, default=func.now(), index=True)
    username = Column(String(150), index=True)
    action = Column(String(100), index=True)
    details = Column(Text)


def init_db():
    """Create tables if they do not exist."""
    Base.metadata.create_all(bind=engine)


def get_session():
    return SessionLocal()


if __name__ == '__main__':
    logger.info(f"Initializing DB at {DB_PATH}")
    init_db()
