import aiosqlite
from fastapi import APIRouter, Depends, Request, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.session import SessionCreateResponse, SessionInfoResponse, SessionStats
from app.security.rate_limit import get_client_ip, session_create_limiter
from app.security.sessions import create_anonymous_session

router = APIRouter(prefix="/api/session", tags=["session"])


async def _get_session_stats(db: aiosqlite.Connection, session_id: str) -> SessionStats:
    doc_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM documents WHERE session_id = ?", (session_id,)
    )
    doc_row = await doc_cursor.fetchone()

    mat_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM generated_materials WHERE session_id = ?",
        (session_id,),
    )
    mat_row = await mat_cursor.fetchone()

    job_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM ai_jobs WHERE session_id = ? AND status IN ('queued', 'processing')",
        (session_id,),
    )
    job_row = await job_cursor.fetchone()

    task_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM planner_tasks WHERE session_id = ? AND completed = 1",
        (session_id,),
    )
    task_row = await task_cursor.fetchone()

    return SessionStats(
        document_count=doc_row["cnt"] if doc_row else 0,
        material_count=mat_row["cnt"] if mat_row else 0,
        pending_job_count=job_row["cnt"] if job_row else 0,
        completed_task_count=task_row["cnt"] if task_row else 0,
    )


@router.post("", response_model=SessionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_session_endpoint(
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> SessionCreateResponse:
    """Create a new anonymous browser session and return its raw token once."""
    client_ip = get_client_ip(request)
    session_create_limiter.check(client_ip)

    session_data, raw_token = await create_anonymous_session(db)
    return SessionCreateResponse(
        session_id=session_data["id"],
        session_token=raw_token,
        created_at=session_data["created_at"],
        last_active_at=session_data["last_active_at"],
        expires_at=session_data["expires_at"],
        stats=SessionStats(),
    )


@router.get("/me", response_model=SessionInfoResponse)
async def get_my_session_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> SessionInfoResponse:
    """Validate the current anonymous session token and return session metadata + counts."""
    stats = await _get_session_stats(db, current_session["id"])
    return SessionInfoResponse(
        session_id=current_session["id"],
        created_at=current_session["created_at"],
        last_active_at=current_session["last_active_at"],
        expires_at=current_session["expires_at"],
        stats=stats,
    )
