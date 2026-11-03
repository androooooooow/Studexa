import json
from typing import Any, Dict, List
import uuid
import aiosqlite
from app.schemas.study_tools import (
    ExamAttemptItem,
    MCQQuestionPublic,
    MCQSetLLMOutput,
    QuizMaterialResponse,
)
from app.security.sessions import to_iso, utc_now
from app.services.ollama_service import (
    OllamaGenerationError,
    build_bounded_source_context,
    generate_and_validate_json,
)
from app.services.quiz_service import (
    QUIZ_SCHEMA_HINT,
    normalize_mcq_questions,
)
from app.workers.ai_worker import register_job_handler


async def handle_exam_job(
    db: aiosqlite.Connection,
    job_id: str,
    session_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    document_id = payload["document_id"]
    options = payload.get("options") or {}
    question_count = int(options.get("question_count", 20))
    difficulty = options.get("difficulty", "hard")
    question_type = options.get("question_type", "mixed")

    max_c = 50 if question_count >= 50 else (25 if question_count >= 20 else 16)
    max_ch = 35000 if question_count >= 50 else (18000 if question_count >= 20 else 9000)

    excerpts, chunk_refs, doc_name = await build_bounded_source_context(
        db=db,
        session_id=session_id,
        document_id=document_id,
        query="",
        max_chunks=max_c,
        max_chars=max_ch,
    )

    questions = normalize_mcq_questions(
        raw_questions=[],
        target_count=question_count,
        excerpts=excerpts,
        chunk_refs=chunk_refs,
        question_type=question_type,
    )
    material_id = str(uuid.uuid4())
    created_at = to_iso(utc_now())
    type_label = question_type.replace("_", " ").title() if question_type != "mixed" else "Comprehensive"
    title = f"{doc_name} — {difficulty.capitalize()} {type_label} Exam ({len(questions)} Qs)"

    stored_json = {
        "difficulty": difficulty,
        "question_type": question_type,
        "source_chunks_used": chunk_refs,
        "questions": questions,
    }

    await db.execute(
        """
        INSERT INTO generated_materials (
            id, session_id, document_id, material_type, title, content_json, created_at
        )
        VALUES (?, ?, ?, 'exam', ?, ?, ?)
        """,
        (material_id, session_id, document_id, title, json.dumps(stored_json), created_at),
    )
    await db.execute(
        """
        INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
        VALUES (?, ?, 'exam_generated', ?, ?)
        """,
        (str(uuid.uuid4()), session_id, material_id, created_at),
    )
    await db.commit()

    public_questions = [
        {
            "question_index": idx,
            "question": q["question"],
            "question_type": q.get("question_type", "multiple_choice"),
            "options": q.get("options", []),
            "expected_items": q.get("expected_items", []),
            "formula": q.get("formula"),
            "chunk_ref": q.get("chunk_ref"),
        }
        for idx, q in enumerate(questions)
    ]

    return {
        "material_id": material_id,
        "document_id": document_id,
        "title": title,
        "difficulty": difficulty,
        "question_type": question_type,
        "question_count": len(questions),
        "questions": public_questions,
        "created_at": created_at,
    }


def _to_exam_response(row: aiosqlite.Row, include_answers: bool = False) -> QuizMaterialResponse:
    data = json.loads(row["content_json"])
    raw_questions = data.get("questions", [])
    pub_questions: List[MCQQuestionPublic] = []
    for idx, q in enumerate(raw_questions):
        pub_questions.append(
            MCQQuestionPublic(
                question_index=idx,
                question=q["question"],
                question_type=q.get("question_type", "multiple_choice"),
                options=q.get("options", []),
                expected_items=q.get("expected_items", []),
                sequence_items=q.get("sequence_items", []),
                formula=q.get("formula"),
                chunk_ref=q.get("chunk_ref"),
                correct_index=q.get("correct_index") if include_answers else None,
                correct_answer=q.get("correct_answer") if include_answers else None,
                explanation=q.get("explanation") if include_answers else None,
            )
        )
    return QuizMaterialResponse(
        id=row["id"],
        document_id=row["document_id"],
        title=row["title"],
        difficulty=data.get("difficulty", "hard"),
        question_type=data.get("question_type", "mixed"),
        question_count=len(pub_questions),
        questions=pub_questions,
        created_at=row["created_at"],
    )


async def list_session_exams(
    db: aiosqlite.Connection, session_id: str, include_answers: bool = False
) -> List[QuizMaterialResponse]:
    cursor = await db.execute(
        """
        SELECT id, document_id, title, content_json, created_at
        FROM generated_materials
        WHERE session_id = ? AND material_type = 'exam'
        ORDER BY created_at DESC
        """,
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [_to_exam_response(r, include_answers=include_answers) for r in rows]


async def list_session_exam_attempts(
    db: aiosqlite.Connection, session_id: str
) -> List[ExamAttemptItem]:
    cursor = await db.execute(
        """
        SELECT
            a.id,
            a.material_id AS exam_id,
            COALESCE(m.title, 'Practice Assessment') AS exam_title,
            a.score,
            a.total_questions,
            a.percentage,
            a.created_at
        FROM quiz_attempts a
        LEFT JOIN generated_materials m ON m.id = a.material_id
        WHERE a.session_id = ?
        ORDER BY a.created_at DESC
        """,
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [
        ExamAttemptItem(
            id=r["id"],
            exam_id=r["exam_id"],
            exam_title=r["exam_title"],
            score=r["score"],
            total_questions=r["total_questions"],
            percentage=r["percentage"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


register_job_handler("exam", handle_exam_job)
