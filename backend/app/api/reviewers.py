from typing import Any, Dict, List
import aiosqlite
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobResponse
from app.services.reviewer_service import list_session_reviewers
from app.workers.ai_worker import enqueue_ai_job

router = APIRouter(prefix="/api/reviewers", tags=["reviewers"])


class ReviewerGenerateRequest(BaseModel):
    document_id: str
    mode: str = "standard"  # standard, exam_focused, in_depth


@router.post("/generate", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_reviewer_endpoint(
    body: ReviewerGenerateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Enqueue an AI job to convert uploaded PDF, PPT, PPTX, or DOCX into a downloadable study reviewer."""
    payload = {
        "document_id": body.document_id,
        "prompt": f"Generate a comprehensive {body.mode} study reviewer.",
        "options": {"mode": body.mode},
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type="reviewer",
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("", response_model=List[Dict[str, Any]])
async def get_reviewers_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List all generated study reviewers for the current anonymous session."""
    return await list_session_reviewers(db, current_session["id"])
