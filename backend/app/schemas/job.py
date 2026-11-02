from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

AllowedJobType = Literal[
    "summary",
    "quiz",
    "flashcards",
    "tutor",
    "exam",
    "document_overview",
]


class AIJobCreateRequest(BaseModel):
    job_type: AllowedJobType
    document_id: Optional[str] = Field(
        default=None,
        description="Optional source document ID owned by the current session",
    )
    prompt: Optional[str] = Field(
        default=None,
        max_length=2000,
        description="Optional student question or instruction",
    )
    options: Dict[str, Any] = Field(
        default_factory=dict,
        description="Task-specific options (style, question_count, difficulty, etc.)",
    )


class AIJobResponse(BaseModel):
    id: str
    job_type: str
    status: str
    payload: Dict[str, Any]
    result: Optional[Any] = None
    error_message: Optional[str] = None
    queue_position: Optional[int] = Field(
        default=None,
        description="1-based position in the FIFO queue if status is queued (privacy-safe)",
    )
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class AIJobListResponse(BaseModel):
    jobs: List[AIJobResponse]
    global_queue_depth: int
    max_queue_size: int
