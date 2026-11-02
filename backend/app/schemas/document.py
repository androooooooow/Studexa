from typing import List, Optional
from pydantic import BaseModel, Field


class DocumentChunkPreview(BaseModel):
    chunk_index: int
    chunk_text: str


class DocumentItem(BaseModel):
    id: str
    original_filename: str
    file_type: str
    file_size: int
    extracted_text_status: str
    chunk_count: int = 0
    status_message: Optional[str] = None
    created_at: str


class DocumentDetailResponse(DocumentItem):
    chunks: List[DocumentChunkPreview] = Field(default_factory=list)


class DocumentListResponse(BaseModel):
    documents: List[DocumentItem]
