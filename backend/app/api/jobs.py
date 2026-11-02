import aiosqlite
from fastapi import APIRouter, Depends, Response, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobCreateRequest, AIJobListResponse, AIJobResponse
from app.workers.ai_worker import (
    cancel_queued_session_job,
    enqueue_ai_job,
    get_session_job,
    list_session_jobs,
)

router = APIRouter(prefix="/api/ai/jobs", tags=["ai_jobs"])


@router.post("", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_ai_job_endpoint(
    body: AIJobCreateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Enqueue a serialized AI generation job for the current anonymous session."""
    payload = {
        "document_id": body.document_id,
        "prompt": body.prompt,
        "options": body.options,
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type=body.job_type,
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("", response_model=AIJobListResponse)
async def list_ai_jobs_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobListResponse:
    """List AI jobs belonging to the current anonymous session and global queue depth."""
    data = await list_session_jobs(db, current_session["id"])
    return AIJobListResponse(
        jobs=[AIJobResponse(**j) for j in data["jobs"]],
        global_queue_depth=data["global_queue_depth"],
        max_queue_size=data["max_queue_size"],
    )


@router.get("/{job_id}", response_model=AIJobResponse)
async def get_ai_job_endpoint(
    job_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Poll the status and result of a specific AI job owned by the current session."""
    job = await get_session_job(db, current_session["id"], job_id)
    return AIJobResponse(**job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_job_endpoint(
    job_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> Response:
    """Cancel and remove a job only if it is owned by the current session and still queued."""
    await cancel_queued_session_job(db, current_session["id"], job_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
