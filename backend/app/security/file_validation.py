"""File validation utilities (expanded in Phase 2 for PDF/DOCX uploads)."""
from pathlib import Path

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def sanitize_display_filename(filename: str) -> str:
    """Strip any directory components from an uploaded filename to prevent path traversal."""
    clean = Path(filename).name.strip()
    return clean or "unnamed_document"
