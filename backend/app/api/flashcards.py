from typing import List
import aiosqlite
from fastapi import APIRouter, Depends, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobResponse
from app.schemas.study_tools import (
    FlashcardDeckResponse,
    FlashcardGenerateRequest,
)
from app.services.flashcard_service import list_session_flashcard_decks
from app.workers.ai_worker import enqueue_ai_job

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.post("/generate", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_flashcards_endpoint(
    body: FlashcardGenerateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Enqueue a serialized AI flashcard deck generation job."""
    payload = {
        "document_id": body.document_id,
        "prompt": f"Generate {body.card_count} flashcards.",
        "options": {"card_count": body.card_count},
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type="flashcards",
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("", response_model=List[FlashcardDeckResponse])
async def get_flashcards_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[FlashcardDeckResponse]:
    """List all flashcard decks generated in the current anonymous session."""
    return await list_session_flashcard_decks(db, current_session["id"])
