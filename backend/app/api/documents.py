import aiosqlite
from fastapi import APIRouter, Depends, File, UploadFile, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.document import (
    DocumentDeleteResponse,
    DocumentDetailResponse,
    DocumentItem,
    DocumentListResponse,
)
from app.services.document_service import (
    delete_session_document,
    get_session_document_detail,
    list_session_documents,
    process_and_store_document,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentItem, status_code=status.HTTP_201_CREATED)
async def upload_document_endpoint(
    file: UploadFile = File(...),
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> DocumentItem:
    """Upload a PDF or DOCX file, extract text, chunk it, and index it in SQLite FTS5."""
    doc = await process_and_store_document(db, current_session["id"], file)
    return DocumentItem(**doc)


@router.get("", response_model=DocumentListResponse)
async def list_documents_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> DocumentListResponse:
    """List all uploaded documents owned by the current anonymous session."""
    docs = await list_session_documents(db, current_session["id"])
    return DocumentListResponse(documents=[DocumentItem(**d) for d in docs])


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document_endpoint(
    document_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> DocumentDetailResponse:
    """Fetch metadata and extracted text chunks for an owned document."""
    doc = await get_session_document_detail(db, current_session["id"], document_id)
    return DocumentDetailResponse(**doc)


@router.delete("/{document_id}", response_model=DocumentDeleteResponse, status_code=status.HTTP_200_OK)
async def delete_document_endpoint(
    document_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> DocumentDeleteResponse:
    """Delete an owned document, its chunks, FTS5 entries, and stored disk file."""
    await delete_session_document(db, current_session["id"], document_id)
    return DocumentDeleteResponse(
        success=True,
        message="Document deleted successfully",
    )
