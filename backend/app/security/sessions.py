import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import aiosqlite
from app.config import settings


def generate_session_token() -> str:
    """Generate a cryptographically secure 256-bit URL-safe token."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """Return the SHA-256 hex digest of a raw session token. Never store raw tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    return dt.isoformat()


def from_iso(iso_str: str) -> datetime:
    dt = datetime.fromisoformat(iso_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def create_anonymous_session(db: aiosqlite.Connection) -> Tuple[dict, str]:
    """
    Create a new anonymous session record in SQLite.
    Returns (session_dict, raw_token). Only token_hash is persisted.
    """
    raw_token = generate_session_token()
    token_hash = hash_session_token(raw_token)
    session_id = str(uuid.uuid4())
    now = utc_now()
    expires = now + timedelta(days=settings.SESSION_TTL_DAYS)

    created_at = to_iso(now)
    last_active_at = created_at
    expires_at = to_iso(expires)

    await db.execute(
        """
        INSERT INTO sessions (id, token_hash, created_at, last_active_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (session_id, token_hash, created_at, last_active_at, expires_at),
    )
    await db.commit()

    session_data = {
        "id": session_id,
        "created_at": created_at,
        "last_active_at": last_active_at,
        "expires_at": expires_at,
    }
    return session_data, raw_token


async def validate_session_token(
    db: aiosqlite.Connection, raw_token: str
) -> Optional[dict]:
    """
    Look up session by SHA-256 hash of raw_token, check expiry, and refresh last_active_at.
    Returns session dict if valid, or None if invalid/expired.
    """
    if not raw_token or len(raw_token) < 16 or len(raw_token) > 256:
        return None

    token_hash = hash_session_token(raw_token)
    cursor = await db.execute(
        """
        SELECT id, created_at, last_active_at, expires_at
        FROM sessions
        WHERE token_hash = ?
        """,
        (token_hash,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    now = utc_now()
    expires_at = from_iso(row["expires_at"])
    if now >= expires_at:
        # Clean up expired session
        await db.execute("DELETE FROM sessions WHERE id = ?", (row["id"],))
        await db.commit()
        return None

    # Update last_active_at and extend rolling expiration window
    new_last_active = to_iso(now)
    new_expires_at = to_iso(now + timedelta(days=settings.SESSION_TTL_DAYS))
    await db.execute(
        """
        UPDATE sessions
        SET last_active_at = ?, expires_at = ?
        WHERE id = ?
        """,
        (new_last_active, new_expires_at, row["id"]),
    )
    await db.commit()

    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "last_active_at": new_last_active,
        "expires_at": new_expires_at,
    }
