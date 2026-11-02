from typing import List
import aiosqlite
from fastapi import APIRouter, Depends, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobResponse
from app.schemas.study_tools import (
    SummaryGenerateRequest,
    SummaryMaterialResponse,
)
from app.services.summary_service import list_session_summaries
from app.workers.ai_worker import enqueue_ai_job

router = APIRouter(prefix="/api/summaries", tags=["summaries"])


@router.post("/generate", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_summary_endpoint(
    body: SummaryGenerateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Enqueue a serialized AI summary generation job for an owned document."""
    payload = {
        "document_id": body.document_id,
        "prompt": f"Generate a {body.style} summary.",
        "options": {"style": body.style},
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type="summary",
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("", response_model=List[SummaryMaterialResponse])
async def get_summaries_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[SummaryMaterialResponse]:
    """List all generated summaries owned by the current anonymous session."""
    return await list_session_summaries(db, current_session["id"])
