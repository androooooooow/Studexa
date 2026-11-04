from typing import List
import aiosqlite
from fastapi import APIRouter, Depends, status
from app.database import get_db
from app.dependencies import get_current_session
from app.schemas.job import AIJobResponse
from app.schemas.study_tools import (
    TutorChatRequest,
    TutorConversationDetail,
    TutorConversationSummary,
)
from app.services.tutor_service import (
    create_or_append_user_tutor_message,
    get_session_conversation_detail,
    list_session_conversations,
)
from app.workers.ai_worker import enqueue_ai_job

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


@router.post("/chat", response_model=AIJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def tutor_chat_endpoint(
    body: TutorChatRequest,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> AIJobResponse:
    """
    Save the student's question in tutor_messages and enqueue a serialized AI Tutor job
    that retrieves FTS5 chunks before generating a grounded response.
    """
    clean_doc_id = (
        body.document_id.strip()
        if isinstance(body.document_id, str) and body.document_id.strip()
        else None
    )
    conversation_id, user_msg_id = await create_or_append_user_tutor_message(
        db=db,
        session_id=current_session["id"],
        document_id=clean_doc_id,
        question=body.question,
        conversation_id=body.conversation_id,
    )
    payload = {
        "document_id": clean_doc_id,
        "prompt": body.question,
        "options": {
            "conversation_id": conversation_id,
            "user_message_id": user_msg_id,
        },
    }
    job = await enqueue_ai_job(
        db=db,
        session_id=current_session["id"],
        job_type="tutor",
        payload=payload,
    )
    return AIJobResponse(**job)


@router.get("/conversations", response_model=List[TutorConversationSummary])
async def list_conversations_endpoint(
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> List[TutorConversationSummary]:
    """List tutor conversations belonging to the current anonymous session."""
    return await list_session_conversations(db, current_session["id"])


@router.get("/conversations/{conversation_id}", response_model=TutorConversationDetail)
async def get_conversation_endpoint(
    conversation_id: str,
    current_session: dict = Depends(get_current_session),
    db: aiosqlite.Connection = Depends(get_db),
) -> TutorConversationDetail:
    """Get full message transcript for an owned tutor conversation."""
    return await get_session_conversation_detail(
        db, current_session["id"], conversation_id
    )
