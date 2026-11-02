from typing import Dict
import aiosqlite
from fastapi import APIRouter, Depends
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.productivity import (
    ActivityLogItem,
    ActivityLogListResponse,
    ProgressOverviewResponse,
)

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("/overview", response_model=ProgressOverviewResponse)
async def get_progress_overview_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> ProgressOverviewResponse:
    """Calculate all study progress statistics deterministically in Python."""
    session_id = current_session["id"]

    doc_cur = await db.execute(
        "SELECT COUNT(*) AS cnt FROM documents WHERE session_id = ?", (session_id,)
    )
    doc_row = await doc_cur.fetchone()
    doc_count = doc_row["cnt"] if doc_row else 0

    mat_cur = await db.execute(
        """
        SELECT material_type, COUNT(*) AS cnt
        FROM generated_materials
        WHERE session_id = ?
        GROUP BY material_type
        """,
        (session_id,),
    )
    mat_rows = await mat_cur.fetchall()
    counts_by_type: Dict[str, int] = {
        "summary": 0,
        "quiz": 0,
        "flashcards": 0,
        "exam": 0,
    }
    for r in mat_rows:
        counts_by_type[r["material_type"]] = r["cnt"]

    task_cur = await db.execute(
        """
        SELECT
            COUNT(*) AS total_tasks,
            COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completed_tasks
        FROM planner_tasks
        WHERE session_id = ?
        """,
        (session_id,),
    )
    task_row = await task_cur.fetchone()
    total_tasks = task_row["total_tasks"] if task_row else 0
    completed_tasks = task_row["completed_tasks"] if task_row else 0
    pending_tasks = max(0, total_tasks - completed_tasks)

    score_cur = await db.execute(
        """
        SELECT
            a.id,
            a.exam_id,
            COALESCE(m.title, 'Practice Assessment') AS title,
            COALESCE(m.material_type, 'exam') AS material_type,
            a.score,
            a.total_questions,
            a.percentage,
            a.created_at
        FROM exam_attempts a
        LEFT JOIN generated_materials m ON m.id = a.exam_id
        WHERE a.session_id = ?
        ORDER BY a.created_at DESC
        """,
        (session_id,),
    )
    score_rows = await score_cur.fetchall()
    attempt_count = len(score_rows)
    if attempt_count > 0:
        percentages = [float(r["percentage"]) for r in score_rows]
        avg_pct = round(sum(percentages) / attempt_count, 2)
        max_pct = round(max(percentages), 2)
    else:
        avg_pct = 0.0
        max_pct = 0.0

    recent_scores = [
        {
            "attempt_id": r["id"],
            "material_id": r["exam_id"],
            "title": r["title"],
            "material_type": r["material_type"],
            "score": r["score"],
            "total_questions": r["total_questions"],
            "percentage": r["percentage"],
            "created_at": r["created_at"],
        }
        for r in score_rows[:15]
    ]

    return ProgressOverviewResponse(
        document_count=doc_count,
        material_counts_by_type=counts_by_type,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        pending_tasks=pending_tasks,
        exam_attempt_count=attempt_count,
        average_exam_percentage=avg_pct,
        highest_exam_percentage=max_pct,
        recent_scores=recent_scores,
    )


@router.get("/activity", response_model=ActivityLogListResponse)
async def get_progress_activity_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> ActivityLogListResponse:
    """Return recent study activity logs for the current anonymous session."""
    cursor = await db.execute(
        """
        SELECT id, activity_type, reference_id, created_at
        FROM activity_logs
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT 40
        """,
        (current_session["id"],),
    )
    rows = await cursor.fetchall()
    return ActivityLogListResponse(
        activities=[
            ActivityLogItem(
                id=r["id"],
                activity_type=r["activity_type"],
                reference_id=r["reference_id"],
                created_at=r["created_at"],
            )
            for r in rows
        ]
    )
