from pathlib import Path
import uuid
from fastapi import HTTPException, UploadFile, status
from app.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".ppt"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/octet-stream",  # Some browsers send octet-stream; magic bytes are verified below
}


def sanitize_display_filename(filename: str) -> str:
    """Strip any directory components or control chars from an uploaded filename."""
    if not filename:
        return "unnamed_document"
    # Replace backslashes and slashes before extracting name
    normalized = filename.replace("\\", "/").split("/")[-1].strip()
    # Remove null bytes or control characters
    cleaned = "".join(ch for ch in normalized if ch.isprintable() and ch not in {'"', "'", "\x00"})
    return cleaned[:200] or "unnamed_document"


def validate_upload_metadata(upload: UploadFile) -> tuple[str, str]:
    """
    Validate filename extension and Content-Type header.
    Returns (sanitized_original_filename, file_type_short) where file_type_short is 'pdf' or 'docx'.
    """
    raw_name = upload.filename or ""
    clean_name = sanitize_display_filename(raw_name)
    ext = Path(clean_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file extension. Only .pdf, .pptx, .ppt, and .docx files are allowed.",
        )

    content_type = (upload.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported MIME type '{content_type}'. Only PDF, PPTX, and DOCX documents are accepted.",
        )

    if ext == ".pdf":
        file_type = "pdf"
    elif ext in {".pptx", ".ppt"}:
        file_type = "pptx"
    else:
        file_type = "docx"
    return clean_name, file_type


def validate_file_bytes(content: bytes, file_type: str) -> None:
    """Validate file size limits and magic bytes for PDF, PPTX/PPT, and DOCX."""
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    if file_type == "pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid PDF file header.",
            )
    elif file_type == "docx":
        # DOCX is a ZIP archive starting with PK\x03\x04
        if not content.startswith(b"PK\x03\x04"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid DOCX file header.",
            )
    elif file_type == "pptx":
        # PPTX is a ZIP archive (PK\x03\x04) and legacy PPT is OLE2 (\xd0\xcf\x11\xe0)
        if not (content.startswith(b"PK\x03\x04") or content.startswith(b"\xd0\xcf\x11\xe0")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid PowerPoint (PPTX/PPT) file header.",
            )


def generate_safe_storage_path(file_type: str) -> tuple[str, Path]:
    """
    Generate a server-controlled UUID filename and verify path containment inside UPLOAD_DIR.
    Returns (stored_filename, resolved_path).
    """
    ext_map = {"pdf": ".pdf", "docx": ".docx", "pptx": ".pptx"}
    ext = ext_map.get(file_type, ".docx")
    stored_filename = f"{uuid.uuid4().hex}{ext}"
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    target_path = (upload_root / stored_filename).resolve()

    if upload_root not in target_path.parents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid storage path detected.",
        )
    return stored_filename, target_path


def resolve_owned_storage_path(stored_filename: str) -> Path:
    """Safely resolve an existing stored filename inside UPLOAD_DIR, preventing path traversal."""
    if not stored_filename or "/" in stored_filename or "\\" in stored_filename or ".." in stored_filename:
        raise ValueError("Invalid stored filename")
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    target_path = (upload_root / stored_filename).resolve()
    if upload_root not in target_path.parents:
        raise ValueError("Path traversal blocked")
    return target_path
