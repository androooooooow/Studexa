import uuid
import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.productivity import (
    PlannerTaskCreateRequest,
    PlannerTaskListResponse,
    PlannerTaskResponse,
    PlannerTaskUpdateRequest,
)
from app.security.sessions import to_iso, utc_now

router = APIRouter(prefix="/api/planner/tasks", tags=["planner"])


def _row_to_task(row: aiosqlite.Row) -> PlannerTaskResponse:
    return PlannerTaskResponse(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        due_date=row["due_date"],
        completed=bool(row["completed"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=PlannerTaskListResponse)
async def list_planner_tasks_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> PlannerTaskListResponse:
    """List study planner tasks for the current anonymous session."""
    cursor = await db.execute(
        """
        SELECT id, title, description, due_date, completed, created_at, updated_at
        FROM planner_tasks
        WHERE session_id = ?
        ORDER BY completed ASC, COALESCE(due_date, '9999-12-31') ASC, created_at DESC
        """,
        (current_session["id"],),
    )
    rows = await cursor.fetchall()
    return PlannerTaskListResponse(tasks=[_row_to_task(r) for r in rows])


@router.post("", response_model=PlannerTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_planner_task_endpoint(
    body: PlannerTaskCreateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> PlannerTaskResponse:
    """Create a study planner task deterministically in SQLite."""
    task_id = str(uuid.uuid4())
    now_iso = to_iso(utc_now())
    session_id = current_session["id"]

    await db.execute(
        """
        INSERT INTO planner_tasks (
            id, session_id, title, description, due_date, completed, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        """,
        (
            task_id,
            session_id,
            body.title.strip(),
            body.description.strip() if body.description else None,
            body.due_date,
            now_iso,
            now_iso,
        ),
    )
    await db.execute(
        """
        INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
        VALUES (?, ?, 'planner_task_created', ?, ?)
        """,
        (str(uuid.uuid4()), session_id, task_id, now_iso),
    )
    await db.commit()

    return PlannerTaskResponse(
        id=task_id,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        due_date=body.due_date,
        completed=False,
        created_at=now_iso,
        updated_at=now_iso,
    )


@router.patch("/{task_id}", response_model=PlannerTaskResponse)
async def update_planner_task_endpoint(
    task_id: str,
    body: PlannerTaskUpdateRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> PlannerTaskResponse:
    """Update a study task's status, title, description, or due date."""
    session_id = current_session["id"]
    cursor = await db.execute(
        """
        SELECT id, title, description, due_date, completed, created_at, updated_at
        FROM planner_tasks
        WHERE id = ? AND session_id = ?
        """,
        (task_id, session_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in your session.",
        )

    new_title = body.title.strip() if body.title is not None else row["title"]
    new_desc = (
        body.description.strip()
        if body.description is not None
        else row["description"]
    )
    new_due = body.due_date if body.due_date is not None else row["due_date"]
    new_completed = (
        1 if body.completed else 0
    ) if body.completed is not None else row["completed"]
    now_iso = to_iso(utc_now())

    await db.execute(
        """
        UPDATE planner_tasks
        SET title = ?, description = ?, due_date = ?, completed = ?, updated_at = ?
        WHERE id = ? AND session_id = ?
        """,
        (new_title, new_desc, new_due, new_completed, now_iso, task_id, session_id),
    )
    if body.completed is True and not row["completed"]:
        await db.execute(
            """
            INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
            VALUES (?, ?, 'planner_task_completed', ?, ?)
            """,
            (str(uuid.uuid4()), session_id, task_id, now_iso),
        )
    await db.commit()

    return PlannerTaskResponse(
        id=task_id,
        title=new_title,
        description=new_desc,
        due_date=new_due,
        completed=bool(new_completed),
        created_at=row["created_at"],
        updated_at=now_iso,
    )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_planner_task_endpoint(
    task_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> Response:
    """Delete an owned planner task."""
    session_id = current_session["id"]
    cursor = await db.execute(
        "SELECT id FROM planner_tasks WHERE id = ? AND session_id = ?",
        (task_id, session_id),
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in your session.",
        )
    await db.execute(
        "DELETE FROM planner_tasks WHERE id = ? AND session_id = ?",
        (task_id, session_id),
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
