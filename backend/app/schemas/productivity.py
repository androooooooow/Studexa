from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class PlannerTaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    due_date: Optional[str] = Field(default=None, max_length=40)


class PlannerTaskUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    due_date: Optional[str] = Field(default=None, max_length=40)
    completed: Optional[bool] = None


class PlannerTaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    completed: bool
    created_at: str
    updated_at: str


class PlannerTaskListResponse(BaseModel):
    tasks: List[PlannerTaskResponse]


class ProgressOverviewResponse(BaseModel):
    document_count: int
    material_counts_by_type: Dict[str, int]
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    exam_attempt_count: int
    average_exam_percentage: float
    highest_exam_percentage: float
    recent_scores: List[dict]


class ActivityLogItem(BaseModel):
    id: str
    activity_type: str
    reference_id: Optional[str] = None
    created_at: str


class ActivityLogListResponse(BaseModel):
    activities: List[ActivityLogItem]
