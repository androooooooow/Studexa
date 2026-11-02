import logging
from typing import List, Optional
import uuid
import aiosqlite
from fastapi import HTTPException, UploadFile, status
from app.security.file_validation import (
    generate_safe_storage_path,
    resolve_owned_storage_path,
    validate_file_bytes,
    validate_upload_metadata,
)
from app.security.sessions import to_iso, utc_now
from app.services.pdf_service import (
    SCANNED_PDF_MESSAGE,
    extract_text_from_docx_bytes,
    extract_text_from_pdf_bytes,
    extract_text_from_pptx_bytes,
    split_text_into_chunks,
)

logger = logging.getLogger(__name__)


def get_status_message(extracted_status: str) -> Optional[str]:
    if extracted_status == "scanned_no_ocr":
        return SCANNED_PDF_MESSAGE
    if extracted_status == "empty_document":
        return "No readable text was found in this document."
    if extracted_status == "failed":
        return "Text extraction failed for this file."
    return None


async def process_and_store_document(
    db: aiosqlite.Connection,
    session_id: str,
    upload: UploadFile,
) -> dict:
    """
    Validate, save, extract text, chunk, and FTS5-index an uploaded PDF or DOCX document.
    All records are strictly scoped to session_id.
    """
    original_filename, file_type = validate_upload_metadata(upload)
    content = await upload.read()
    validate_file_bytes(content, file_type)

    stored_filename, storage_path = generate_safe_storage_path(file_type)

    # Extract text before writing to DB
    try:
        if file_type == "pdf":
            extracted_text, extracted_status = extract_text_from_pdf_bytes(content)
        elif file_type == "pptx":
            extracted_text, extracted_status = extract_text_from_pptx_bytes(content)
        else:
            extracted_text, extracted_status = extract_text_from_docx_bytes(content)
    except Exception as exc:
        logger.warning("Failed to extract text from %s: %s", original_filename, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not parse the uploaded document. It may be corrupted or password-protected.",
        ) from exc

    # Write file bytes to persistent storage
    storage_path.write_bytes(content)

    chunks = (
        split_text_into_chunks(extracted_text)
        if extracted_status == "completed"
        else []
    )

    doc_id = str(uuid.uuid4())
    created_at = to_iso(utc_now())

    try:
        await db.execute(
            """
            INSERT INTO documents (
                id, session_id, original_filename, stored_filename,
                file_type, file_size, extracted_text_status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc_id,
                session_id,
                original_filename,
                stored_filename,
                file_type,
                len(content),
                extracted_status,
                created_at,
            ),
        )

        for idx, chunk_text in enumerate(chunks):
            await db.execute(
                """
                INSERT INTO document_chunks (document_id, session_id, chunk_index, chunk_text)
                VALUES (?, ?, ?, ?)
                """,
                (doc_id, session_id, idx, chunk_text),
            )

        await db.execute(
            """
            INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
            VALUES (?, ?, 'document_uploaded', ?, ?)
            """,
            (str(uuid.uuid4()), session_id, doc_id, created_at),
        )

        await db.commit()
    except Exception:
        await db.rollback()
        if storage_path.exists():
            storage_path.unlink(missing_ok=True)
        raise

    return {
        "id": doc_id,
        "original_filename": original_filename,
        "file_type": file_type,
        "file_size": len(content),
        "extracted_text_status": extracted_status,
        "chunk_count": len(chunks),
        "status_message": get_status_message(extracted_status),
        "created_at": created_at,
    }


async def list_session_documents(
    db: aiosqlite.Connection, session_id: str
) -> List[dict]:
    cursor = await db.execute(
        """
        SELECT
            d.id,
            d.original_filename,
            d.file_type,
            d.file_size,
            d.extracted_text_status,
            d.created_at,
            COUNT(c.id) AS chunk_count
        FROM documents d
        LEFT JOIN document_chunks c ON c.document_id = d.id AND c.session_id = d.session_id
        WHERE d.session_id = ?
        GROUP BY d.id
        ORDER BY d.created_at DESC
        """,
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": row["id"],
            "original_filename": row["original_filename"],
            "file_type": row["file_type"],
            "file_size": row["file_size"],
            "extracted_text_status": row["extracted_text_status"],
            "chunk_count": row["chunk_count"],
            "status_message": get_status_message(row["extracted_text_status"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


async def get_session_document_detail(
    db: aiosqlite.Connection, session_id: str, document_id: str
) -> dict:
    cursor = await db.execute(
        """
        SELECT
            id, original_filename, file_type, file_size,
            extracted_text_status, created_at
        FROM documents
        WHERE id = ? AND session_id = ?
        """,
        (document_id, session_id),
    )
    doc_row = await cursor.fetchone()
    if doc_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in your session.",
        )

    chunk_cursor = await db.execute(
        """
        SELECT chunk_index, chunk_text
        FROM document_chunks
        WHERE document_id = ? AND session_id = ?
        ORDER BY chunk_index ASC
        """,
        (document_id, session_id),
    )
    chunk_rows = await chunk_cursor.fetchall()
    chunks = [
        {"chunk_index": r["chunk_index"], "chunk_text": r["chunk_text"]}
        for r in chunk_rows
    ]

    return {
        "id": doc_row["id"],
        "original_filename": doc_row["original_filename"],
        "file_type": doc_row["file_type"],
        "file_size": doc_row["file_size"],
        "extracted_text_status": doc_row["extracted_text_status"],
        "chunk_count": len(chunks),
        "status_message": get_status_message(doc_row["extracted_text_status"]),
        "created_at": doc_row["created_at"],
        "chunks": chunks,
    }


async def delete_session_document(
    db: aiosqlite.Connection, session_id: str, document_id: str
) -> None:
    cursor = await db.execute(
        """
        SELECT id, stored_filename
        FROM documents
        WHERE id = ? AND session_id = ?
        """,
        (document_id, session_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in your session.",
        )

    stored_filename = row["stored_filename"]
    await db.execute(
        "DELETE FROM documents WHERE id = ? AND session_id = ?",
        (document_id, session_id),
    )
    await db.commit()

    try:
        file_path = resolve_owned_storage_path(stored_filename)
        if file_path.exists():
            file_path.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("Could not remove stored file %s: %s", stored_filename, exc)
