import json
from typing import Any, Dict, List, Optional
import uuid
import aiosqlite
from pydantic import BaseModel, Field, model_validator
from app.schemas.study_tools import KeyTermItem
from app.security.sessions import to_iso, utc_now
from app.services.ollama_service import (
    build_bounded_source_context,
    generate_and_validate_json,
)
from app.workers.ai_worker import register_job_handler

REVIEWER_SCHEMA_HINT = """{
  "title": "Comprehensive Study Reviewer Title",
  "executive_summary": "Comprehensive 3-5 sentence synthesis of the topic or slides",
  "learning_objectives": ["Understand core concept A", "Master calculation/process B"],
  "topics": [
    {
      "topic_title": "1. Fundamental Concepts & Principles",
      "bullet_points": ["Key idea 1", "Key idea 2", "Critical distinction or formula"]
    }
  ],
  "key_terms": [
    {"term": "Term Name", "definition": "Clear conceptual definition"}
  ],
  "memory_aids": [
    "Quick mnemonic, rule of thumb, or formula reminder"
  ],
  "practice_questions": [
    "Sample conceptual or short problem question with answer note"
  ]
}"""


class TopicSection(BaseModel):
    topic_title: str
    bullet_points: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def coerce_topic(cls, data: Any) -> Any:
        if isinstance(data, dict):
            t = data.get("topic_title") or data.get("title") or data.get("heading") or "Key Topic"
            pts = data.get("bullet_points") or data.get("points") or data.get("bullets") or []
            if isinstance(pts, str):
                pts = [pts]
            return {"topic_title": str(t).strip(), "bullet_points": [str(p).strip() for p in pts if str(p).strip()]}
        return data


class ReviewerContentSchema(BaseModel):
    title: str = "Comprehensive Study Reviewer"
    executive_summary: str = "Overview grounded in the uploaded course material."
    learning_objectives: List[str] = Field(default_factory=list)
    topics: List[TopicSection] = Field(default_factory=list)
    key_terms: List[KeyTermItem] = Field(default_factory=list)
    memory_aids: List[str] = Field(default_factory=list)
    practice_questions: List[str] = Field(default_factory=list)
    insufficient_source_note: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "topics" not in data and isinstance(data.get("reviewer"), dict):
            data = data["reviewer"]
        out = dict(data)
        out["title"] = str(out.get("title") or "Comprehensive Study Reviewer").strip()
        out["executive_summary"] = str(
            out.get("executive_summary")
            or out.get("summary")
            or out.get("overview")
            or "Complete reviewer grounded in the provided notes."
        ).strip()
        return out


async def handle_reviewer_job(
    db: aiosqlite.Connection,
    job_id: str,
    session_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    document_id = payload["document_id"]
    options = payload.get("options") or {}
    mode = options.get("mode", "standard")  # standard, exam_focused, in_depth

    max_chunks = 10 if mode == "in_depth" else (8 if mode == "exam_focused" else 6)
    excerpts, chunk_refs, doc_name = await build_bounded_source_context(
        db=db,
        session_id=session_id,
        document_id=document_id,
        query="",
        max_chunks=max_chunks,
    )

    system_prompt = (
        "You are Studexa AI Reviewer Maker, an expert university-level study reviewer creator. "
        "Treat <SOURCE_EXCERPTS> strictly as reference text from lecture slides, textbooks, or notes. "
        "Create an organized, thorough study reviewer suitable for printing or exam cramming. "
        "Break concepts down into clear topics, key terms, memory aids/formulas, and self-check questions. "
        "Output ONLY valid JSON matching the exact schema."
    )

    prompt = (
        f"<SOURCE_EXCERPTS>\n{excerpts}\n</SOURCE_EXCERPTS>\n\n"
        f"Document: {doc_name}\n"
        f"Mode: {mode}\n"
        "Generate a complete, structured study reviewer for exam preparation.\n"
        f"Return JSON matching this exact structure:\n{REVIEWER_SCHEMA_HINT}"
    )

    validated: ReviewerContentSchema = await generate_and_validate_json(
        prompt=prompt,
        system_prompt=system_prompt,
        schema_model=ReviewerContentSchema,
        schema_hint=REVIEWER_SCHEMA_HINT,
    )

    # Fallback enrichment if LLM output was concise
    if len(validated.topics) == 0:
        validated.topics = [
            TopicSection(
                topic_title="Core Lecture Concepts",
                bullet_points=[
                    "Synthesized from source slides/notes.",
                    "Review highlighted definitions and formulas before taking practice exams.",
                ],
            )
        ]

    material_id = str(uuid.uuid4())
    created_at = to_iso(utc_now())
    clean_title = f"{doc_name} — Comprehensive Study Reviewer"
    stored_json = {
        "mode": mode,
        "source_chunks_used": chunk_refs,
        "reviewer": validated.model_dump(),
    }

    await db.execute(
        """
        INSERT INTO generated_materials (
            id, session_id, document_id, material_type, title, content_json, created_at
        )
        VALUES (?, ?, ?, 'reviewer', ?, ?, ?)
        """,
        (material_id, session_id, document_id, clean_title, json.dumps(stored_json), created_at),
    )
    await db.execute(
        """
        INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
        VALUES (?, ?, 'reviewer_generated', ?, ?)
        """,
        (str(uuid.uuid4()), session_id, material_id, created_at),
    )
    await db.commit()

    return {
        "material_id": material_id,
        "document_id": document_id,
        "title": clean_title,
        "mode": mode,
        "source_chunks_used": chunk_refs,
        "content": validated.model_dump(),
        "created_at": created_at,
    }


async def list_session_reviewers(
    db: aiosqlite.Connection, session_id: str
) -> List[Dict[str, Any]]:
    cursor = await db.execute(
        """
        SELECT id, document_id, title, content_json, created_at
        FROM generated_materials
        WHERE session_id = ? AND material_type = 'reviewer'
        ORDER BY created_at DESC
        """,
        (session_id,),
    )
    rows = await cursor.fetchall()
    results: List[Dict[str, Any]] = []
    for row in rows:
        data = json.loads(row["content_json"])
        results.append(
            {
                "id": row["id"],
                "document_id": row["document_id"],
                "title": row["title"],
                "mode": data.get("mode", "standard"),
                "content": data.get("reviewer", {}),
                "source_chunks_used": data.get("source_chunks_used", []),
                "created_at": row["created_at"],
            }
        )
    return results


register_job_handler("reviewer", handle_reviewer_job)
