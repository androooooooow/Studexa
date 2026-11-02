import re
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


def _coerce_chunk_ref(val: Any) -> Optional[int]:
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, str):
        m = re.search(r"\d+", val)
        if m:
            return int(m.group(0))
    return None


# -------------------- SUMMARIZER --------------------
class KeyTermItem(BaseModel):
    term: str
    definition: str

    @model_validator(mode="before")
    @classmethod
    def coerce_key_term(cls, data: Any) -> Any:
        if isinstance(data, str):
            if ":" in data:
                t, d = data.split(":", 1)
                return {"term": t.strip(), "definition": d.strip() or "Key concept from source."}
            return {"term": data.strip(), "definition": "Key concept mentioned in the source document."}
        if isinstance(data, dict):
            term = data.get("term") or data.get("name") or data.get("concept") or "Key Concept"
            definition = (
                data.get("definition")
                or data.get("meaning")
                or data.get("description")
                or "Key concept from the source document."
            )
            return {"term": str(term).strip(), "definition": str(definition).strip()}
        return data


class SummaryContentSchema(BaseModel):
    overview: str = "Summary of the provided study document."
    main_ideas: List[str] = Field(default_factory=list)
    key_terms: List[KeyTermItem] = Field(default_factory=list)
    important_details: List[str] = Field(default_factory=list)
    insufficient_source_note: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_summary_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Handle nested {"summary": {...}} if LLM wrapped it
        if "overview" not in data and isinstance(data.get("summary"), dict):
            data = data["summary"]
        out = dict(data)
        out["overview"] = str(out.get("overview") or "Summary grounded in the uploaded document.").strip()
        for list_field in ("main_ideas", "important_details"):
            raw_list = out.get(list_field)
            if isinstance(raw_list, list):
                out[list_field] = [
                    str(item.get("text") or item.get("idea") or item.get("detail") or item).strip()
                    if isinstance(item, dict)
                    else str(item).strip()
                    for item in raw_list
                    if item
                ]
            else:
                out[list_field] = []
        return out


class SummaryGenerateRequest(BaseModel):
    document_id: str
    style: Literal["short", "medium", "detailed"] = "medium"


class SummaryMaterialResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    style: str = "medium"
    content: SummaryContentSchema
    source_chunks_used: List[int] = Field(default_factory=list)
    created_at: str


# -------------------- QUIZZES & EXAMS --------------------
class MCQQuestionFull(BaseModel):
    question: str
    options: List[str] = Field(..., min_length=2, max_length=6)
    correct_index: int = Field(default=0, ge=0, le=5)
    explanation: str = "Grounded in the uploaded source document."
    chunk_ref: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_mcq_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        question = str(
            out.get("question") or out.get("prompt") or out.get("stem") or ""
        ).strip()
        out["question"] = question

        # Normalize options from list or dict
        raw_opts = out.get("options") or out.get("choices") or out.get("answers") or []
        if isinstance(raw_opts, dict):
            opts = [str(v).strip() for v in raw_opts.values() if str(v).strip()]
        elif isinstance(raw_opts, list):
            opts = []
            for item in raw_opts:
                if isinstance(item, dict):
                    val = item.get("text") or item.get("option") or item.get("label") or ""
                    if str(val).strip():
                        opts.append(str(val).strip())
                elif str(item).strip():
                    opts.append(str(item).strip())
        else:
            opts = []

        while len(opts) < 4:
            opts.append(f"Option {chr(65 + len(opts))}")
        opts = opts[:4]
        out["options"] = opts

        # Normalize correct_index
        raw_idx = out.get("correct_index")
        if raw_idx is None:
            raw_idx = out.get("answer_index", out.get("correct_answer", out.get("answer", 0)))
        correct_idx = 0
        if isinstance(raw_idx, int):
            correct_idx = raw_idx if 0 <= raw_idx < len(opts) else 0
        elif isinstance(raw_idx, str):
            s = raw_idx.strip().upper()
            if s in ("A", "B", "C", "D"):
                correct_idx = ord(s) - ord("A")
            elif s.isdigit():
                val = int(s)
                correct_idx = val if 0 <= val < len(opts) else 0
            else:
                for i, opt in enumerate(opts):
                    if opt.lower() == raw_idx.strip().lower():
                        correct_idx = i
                        break
        out["correct_index"] = max(0, min(correct_idx, len(opts) - 1))

        # Normalize explanation and cap runaway repetition
        raw_exp = out.get("explanation") or out.get("rationale") or out.get("reason")
        exp_str = str(raw_exp).strip() if raw_exp else "Grounded in the provided study document."
        if len(exp_str) > 350:
            exp_str = exp_str[:347].rsplit(" ", 1)[0] + "..."
        out["explanation"] = exp_str

        out["chunk_ref"] = _coerce_chunk_ref(out.get("chunk_ref"))
        return out


class MCQSetLLMOutput(BaseModel):
    questions: List[MCQQuestionFull] = Field(..., min_length=1)

    @model_validator(mode="before")
    @classmethod
    def filter_valid_questions(cls, data: Any) -> Any:
        if isinstance(data, list):
            data = {"questions": data}
        if not isinstance(data, dict):
            return data
        raw_list = data.get("questions") or data.get("items") or data.get("quiz") or data.get("exam") or []
        if not isinstance(raw_list, list):
            return data
        cleaned = []
        for item in raw_list:
            if isinstance(item, dict) and (item.get("question") or item.get("prompt") or item.get("stem")):
                cleaned.append(item)
        if cleaned:
            return {"questions": cleaned}
        return data


class MCQQuestionPublic(BaseModel):
    question_index: int
    question: str
    options: List[str]
    chunk_ref: Optional[int] = None
    correct_index: Optional[int] = None
    explanation: Optional[str] = None


class QuizGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(default=20, ge=1, le=100)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class QuizMaterialResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    difficulty: str = "medium"
    question_count: int
    questions: List[MCQQuestionPublic]
    created_at: str


class QuizSubmitRequest(BaseModel):
    answers: Dict[str, int] = Field(
        ...,
        description="Mapping of question_index (as string or int key) to selected option index (0-based)",
    )


class GradedQuestionReview(BaseModel):
    question_index: int
    question: str
    options: List[str]
    selected_index: Optional[int] = None
    correct_index: int
    is_correct: bool
    explanation: str
    chunk_ref: Optional[int] = None


class QuizOrExamGradeResponse(BaseModel):
    attempt_id: str
    material_id: str
    score: int
    total_questions: int
    percentage: float
    reviews: List[GradedQuestionReview]
    created_at: str


# -------------------- FLASHCARDS --------------------
class FlashcardItem(BaseModel):
    question: str
    answer: str
    chunk_ref: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_flashcard_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        q = str(data.get("question") or data.get("front") or data.get("term") or "").strip()
        a = str(data.get("answer") or data.get("back") or data.get("definition") or "").strip()
        return {
            "question": q,
            "answer": a or "Concept from uploaded study material.",
            "chunk_ref": _coerce_chunk_ref(data.get("chunk_ref")),
        }


class FlashcardLLMOutput(BaseModel):
    cards: List[FlashcardItem] = Field(..., min_length=1)

    @model_validator(mode="before")
    @classmethod
    def filter_valid_cards(cls, data: Any) -> Any:
        if isinstance(data, list):
            data = {"cards": data}
        if not isinstance(data, dict):
            return data
        raw_list = data.get("cards") or data.get("flashcards") or data.get("items") or []
        if not isinstance(raw_list, list):
            return data
        cleaned = [
            item
            for item in raw_list
            if isinstance(item, dict)
            and (item.get("question") or item.get("front") or item.get("term"))
        ]
        if cleaned:
            return {"cards": cleaned}
        return data


class FlashcardGenerateRequest(BaseModel):
    document_id: str
    card_count: int = Field(default=20, ge=1, le=100)


class FlashcardDeckResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    cards: List[FlashcardItem]
    created_at: str


# -------------------- AI TUTOR --------------------
class TutorLLMOutput(BaseModel):
    answer: str
    is_accountancy_related: bool = True
    source_grounded: bool = True
    knowledge_label: str = "Grounded in uploaded document"
    cited_chunks: List[int] = Field(default_factory=list)


class TutorChatRequest(BaseModel):
    document_id: Optional[str] = None
    question: str = Field(..., min_length=2, max_length=1500)
    conversation_id: Optional[str] = None


class TutorMessageItem(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: str


class TutorConversationSummary(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    created_at: str


class TutorConversationDetail(TutorConversationSummary):
    messages: List[TutorMessageItem] = Field(default_factory=list)


# -------------------- EXAMS --------------------
class ExamGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(default=20, ge=1, le=100)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class ExamAttemptItem(BaseModel):
    id: str
    exam_id: str
    exam_title: str
    score: int
    total_questions: int
    percentage: float
    created_at: str
