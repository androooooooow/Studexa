from typing import Optional
import aiosqlite
from fastapi import Depends, Header, HTTPException, Request, status
from app.database import get_db
from app.security.rate_limit import session_action_limiter
from app.security.sessions import validate_session_token


def extract_raw_token(
    x_session_token: Optional[str] = Header(default=None, alias="X-Session-Token"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[str]:
    """Extract raw session token from X-Session-Token or Authorization: Bearer header."""
    if x_session_token and x_session_token.strip():
        return x_session_token.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


async def get_current_session(
    request: Request,
    raw_token: Optional[str] = Depends(extract_raw_token),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """
    FastAPI dependency that validates the caller's anonymous session token.
    Never trusts a session_id passed in query/body; always derives session from the verified token hash.
    """
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing anonymous session token. Call POST /api/session first.",
        )

    session = await validate_session_token(db, raw_token)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired anonymous session token.",
        )

    session_action_limiter.check(session["id"])
    return session
