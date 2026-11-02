import re
from typing import List
import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response, status
from app.database import get_db
from app.dependencies import get_current_session
from app.services.pdf_generator import generate_material_pdf_bytes

router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("")
async def list_generated_materials_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """List all generated study materials for the Personal Study Library."""
    cursor = await db.execute(
        """
        SELECT id, document_id, material_type, title, created_at
        FROM generated_materials
        WHERE session_id = ?
        ORDER BY created_at DESC
        """,
        (current_session["id"],),
    )
    rows = await cursor.fetchall()
    items: List[dict] = [
        {
            "id": r["id"],
            "document_id": r["document_id"],
            "material_type": r["material_type"],
            "title": r["title"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
    return {"materials": items}


@router.get("/{file_id}")
async def export_material_pdf_endpoint(
    file_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> Response:
    """
    Export an owned generated study material (summary, quiz, flashcards, or exam) as a PDF via ReportLab.
    Enforces strict session ownership and never exposes server filesystem paths.
    """
    cursor = await db.execute(
        """
        SELECT id, material_type, title, content_json
        FROM generated_materials
        WHERE id = ? AND session_id = ?
        """,
        (file_id, current_session["id"]),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study material not found in your session.",
        )

    pdf_bytes = generate_material_pdf_bytes(
        title=row["title"],
        material_type=row["material_type"],
        content_json_str=row["content_json"],
    )

    safe_slug = re.sub(r"[^A-Za-z0-9_-]+", "_", row["title"])[:60].strip("_") or "study_material"
    download_name = f"{safe_slug}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
        },
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_generated_material_endpoint(
    file_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> Response:
    """Delete an owned generated study material from the Personal Study Library."""
    cursor = await db.execute(
        "SELECT id FROM generated_materials WHERE id = ? AND session_id = ?",
        (file_id, current_session["id"]),
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study material not found in your session.",
        )

    await db.execute(
        "DELETE FROM generated_materials WHERE id = ? AND session_id = ?",
        (file_id, current_session["id"]),
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
