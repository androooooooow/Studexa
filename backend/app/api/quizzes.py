from typing import List
import aiosqlite
from fastapi import APIRouter, Depends, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobResponse
from app.schemas.study_tools import (
    QuizGenerateRequest,
    QuizMaterialResponse,
    QuizOrExamGradeResponse,
    QuizSubmitRequest,
)
from app.services.quiz_service import (
    grade_mcq_material_deterministically,
    list_session_quizzes,
)
from app.workers.ai_worker import enqueue_ai_job

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.post("/generate", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_quiz_endpoint(
    body: QuizGenerateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Enqueue a serialized AI multiple-choice quiz generation job."""
    payload = {
        "document_id": body.document_id,
        "prompt": f"Generate a {body.question_count}-question {body.difficulty} quiz.",
        "options": {
            "question_count": body.question_count,
            "difficulty": body.difficulty,
        },
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type="quiz",
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("", response_model=List[QuizMaterialResponse])
async def get_quizzes_endpoint(
    include_answers: bool = False,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[QuizMaterialResponse]:
    """List generated quizzes for the current session (answer keys hidden by default)."""
    return await list_session_quizzes(
        db, current_session["id"], include_answers=include_answers
    )


@router.post("/{quiz_id}/submit", response_model=QuizOrExamGradeResponse)
async def submit_quiz_endpoint(
    quiz_id: str,
    body: QuizSubmitRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> QuizOrExamGradeResponse:
    """Grade a quiz deterministically in Python and return answers + explanations."""
    return await grade_mcq_material_deterministically(
        db=db,
        session_id=current_session["id"],
        material_id=quiz_id,
        expected_type="quiz",
        submitted_answers=body.answers,
    )
