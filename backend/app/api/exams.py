from typing import List
import aiosqlite
from fastapi import APIRouter, Depends, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobResponse
from app.schemas.study_tools import (
    ExamAttemptItem,
    ExamGenerateRequest,
    QuizMaterialResponse,
    QuizOrExamGradeResponse,
    QuizSubmitRequest,
)
from app.services.exam_service import (
    list_session_exam_attempts,
    list_session_exams,
)
from app.services.quiz_service import grade_mcq_material_deterministically
from app.workers.ai_worker import enqueue_ai_job

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.post("/generate", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_exam_endpoint(
    body: ExamGenerateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """Enqueue a serialized AI practice exam generation job."""
    payload = {
        "document_id": body.document_id,
        "prompt": f"Generate a {body.question_count}-question {body.difficulty} practice exam.",
        "options": {
            "question_count": body.question_count,
            "difficulty": body.difficulty,
        },
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type="exam",
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("", response_model=List[QuizMaterialResponse])
async def get_exams_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[QuizMaterialResponse]:
    """List practice exams generated in the current anonymous session (answers hidden)."""
    return await list_session_exams(db, current_session["id"])


@router.post("/{exam_id}/submit", response_model=QuizOrExamGradeResponse)
async def submit_exam_endpoint(
    exam_id: str,
    body: QuizSubmitRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> QuizOrExamGradeResponse:
    """Deterministically grade a practice exam in Python and save the attempt."""
    return await grade_mcq_material_deterministically(
        db=db,
        session_id=current_session["id"],
        material_id=exam_id,
        expected_type="exam",
        submitted_answers=body.answers,
    )


@router.get("/attempts", response_model=List[ExamAttemptItem])
async def get_exam_attempts_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[ExamAttemptItem]:
    """List all graded quiz and exam attempts for the current anonymous session."""
    return await list_session_exam_attempts(db, current_session["id"])
