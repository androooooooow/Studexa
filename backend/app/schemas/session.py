from pydantic import BaseModel, Field


class SessionStats(BaseModel):
    document_count: int = 0
    material_count: int = 0
    pending_job_count: int = 0
    completed_task_count: int = 0


class SessionInfoResponse(BaseModel):
    session_id: str = Field(..., description="Unique anonymous session identifier")
    created_at: str
    last_active_at: str
    expires_at: str
    stats: SessionStats = Field(default_factory=SessionStats)


class SessionCreateResponse(SessionInfoResponse):
    session_token: str = Field(
        ...,
        description="Cryptographically random session token (stored only as SHA-256 hash on server)",
    )
