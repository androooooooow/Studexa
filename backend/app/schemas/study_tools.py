import re
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


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
    question_type: str = "multiple_choice"  # multiple_choice, true_false, identification, enumeration, sequence, solving
    options: List[str] = Field(default_factory=list)
    correct_index: Optional[int] = 0
    correct_answer: Optional[str] = None
    acceptable_answers: List[str] = Field(default_factory=list)
    expected_items: List[str] = Field(default_factory=list)
    sequence_items: List[str] = Field(default_factory=list)
    formula: Optional[str] = None
    solution_steps: Optional[str] = None
    explanation: str = "Grounded in the core concepts of the uploaded document."
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

        q_type = str(out.get("question_type") or "multiple_choice").lower().strip()
        if q_type not in ("multiple_choice", "true_false", "identification", "enumeration", "sequence", "solving"):
            q_type = "multiple_choice"
        out["question_type"] = q_type

        # Normalize options based on type
        raw_opts = out.get("options") or out.get("choices") or out.get("answers") or []
        if q_type == "true_false":
            out["options"] = ["True", "False"]
        elif q_type in ("identification", "enumeration", "solving"):
            # Do not force dummy 4 options for text or solving questions
            if isinstance(raw_opts, list):
                out["options"] = [str(x).strip() for x in raw_opts if str(x).strip()]
            else:
                out["options"] = []
        else:
            # multiple_choice or sequence
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
            out["options"] = opts[:4]

        # Normalize correct_index
        raw_idx = out.get("correct_index")
        if raw_idx is None and q_type in ("multiple_choice", "true_false"):
            raw_idx = out.get("answer_index", out.get("correct_answer", out.get("answer", 0)))
        correct_idx = 0
        opts = out.get("options") or []
        if isinstance(raw_idx, int):
            correct_idx = raw_idx if 0 <= raw_idx < max(1, len(opts)) else 0
        elif isinstance(raw_idx, str):
            s = raw_idx.strip().upper()
            if s in ("A", "B", "C", "D"):
                correct_idx = ord(s) - ord("A")
            elif s == "TRUE":
                correct_idx = 0
            elif s == "FALSE":
                correct_idx = 1
            elif s.isdigit():
                val = int(s)
                correct_idx = val if 0 <= val < max(1, len(opts)) else 0
            else:
                for i, opt in enumerate(opts):
                    if opt.lower() == raw_idx.strip().lower():
                        correct_idx = i
                        break
        out["correct_index"] = max(0, min(correct_idx, max(0, len(opts) - 1)))

        # Normalize text answer for identification or solving
        if not out.get("correct_answer") and opts and 0 <= correct_idx < len(opts):
            out["correct_answer"] = opts[correct_idx]
        elif not out.get("correct_answer"):
            out["correct_answer"] = str(out.get("answer") or "").strip()

        # Normalize explanation
        raw_exp = out.get("explanation") or out.get("rationale") or out.get("reason")
        exp_str = str(raw_exp).strip() if raw_exp else "Grounded in the core principles of the uploaded document."
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
    question_type: str = "multiple_choice"
    options: List[str] = Field(default_factory=list)
    expected_items: List[str] = Field(default_factory=list)
    sequence_items: List[str] = Field(default_factory=list)
    formula: Optional[str] = None
    chunk_ref: Optional[int] = None
    correct_index: Optional[int] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None


class QuizGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(default=20, ge=1, le=100)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    question_type: str = Field(default="mixed")  # mixed, multiple_choice, true_false, identification, enumeration, sequence, solving


class QuizMaterialResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    difficulty: str = "medium"
    question_type: str = "mixed"
    question_count: int
    questions: List[MCQQuestionPublic]
    created_at: str


class QuizSubmitRequest(BaseModel):
    answers: Dict[str, Any] = Field(
        ...,
        description="Mapping of question_index (as string key) to selected index, text string, or list of strings",
    )


class GradedQuestionReview(BaseModel):
    question_index: int
    question: str
    question_type: str = "multiple_choice"
    options: List[str] = Field(default_factory=list)
    selected_index: Optional[int] = None
    correct_index: Optional[int] = None
    user_answer: Any = None
    correct_answer: Any = None
    is_correct: bool = False
    explanation: str = ""
    chunk_ref: Optional[int] = None


class QuizOrExamGradeResponse(BaseModel):
    attempt_id: str
    material_id: str
    score: int
    total_questions: int
    percentage: float
    reviews: List[GradedQuestionReview]
    created_at: str


class ExamAttemptItem(BaseModel):
    id: str
    exam_id: str
    exam_title: str
    score: int
    total_questions: int
    percentage: float
    created_at: str


# -------------------- FLASHCARDS --------------------
class FlashcardItem(BaseModel):
    question: str
    answer: str
    chunk_ref: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_flashcard(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        out["question"] = str(out.get("question") or out.get("front") or out.get("q") or "").strip()
        out["answer"] = str(out.get("answer") or out.get("back") or out.get("a") or "").strip()
        out["chunk_ref"] = _coerce_chunk_ref(out.get("chunk_ref"))
        return out


class FlashcardSetContent(BaseModel):
    cards: List[FlashcardItem] = Field(..., min_length=1)

    @model_validator(mode="before")
    @classmethod
    def filter_valid_cards(cls, data: Any) -> Any:
        if isinstance(data, list):
            data = {"cards": data}
        if not isinstance(data, dict):
            return data
        raw_cards = data.get("cards") or data.get("flashcards") or data.get("items") or []
        if not isinstance(raw_cards, list):
            return data
        valid = [
            c for c in raw_cards
            if isinstance(c, dict) and (c.get("question") or c.get("front")) and (c.get("answer") or c.get("back"))
        ]
        return {"cards": valid if valid else raw_cards}


FlashcardLLMOutput = FlashcardSetContent


class FlashcardGenerateRequest(BaseModel):
    document_id: str
    card_count: int = Field(default=20, ge=1, le=100)


class FlashcardMaterialResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    card_count: int
    cards: List[FlashcardItem]
    created_at: str


FlashcardDeckResponse = FlashcardMaterialResponse


# -------------------- EXAMS --------------------
class ExamGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(default=50, ge=1, le=100)
    difficulty: Literal["easy", "medium", "hard"] = "hard"
    question_type: str = Field(default="mixed")  # mixed, multiple_choice, true_false, identification, enumeration, sequence, solving


# -------------------- AI TUTOR --------------------
class TutorLLMOutput(BaseModel):
    answer: str
    is_accountancy_related: bool = True
    source_grounded: bool = True
    knowledge_label: str = "Grounded in uploaded document"
    cited_chunks: List[int] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def coerce_tutor_output(cls, data: Any) -> Any:
        if isinstance(data, str):
            return {"answer": data.strip()}
        if not isinstance(data, dict):
            return data
        out = dict(data)
        raw_ans = (
            out.get("answer")
            or out.get("response")
            or out.get("explanation")
            or out.get("text")
            or ""
        )
        if isinstance(raw_ans, dict):
            raw_ans = (
                raw_ans.get("text")
                or raw_ans.get("answer")
                or raw_ans.get("response")
                or str(raw_ans)
            )
        elif isinstance(raw_ans, list):
            raw_ans = "\n".join(str(x).strip() for x in raw_ans if str(x).strip())
        out["answer"] = str(raw_ans).strip()

        for bool_field in ("is_accountancy_related", "source_grounded"):
            if bool_field in out and not isinstance(out[bool_field], bool):
                out[bool_field] = str(out[bool_field]).strip().lower() not in (
                    "false",
                    "0",
                    "no",
                )

        if "knowledge_label" in out and out["knowledge_label"] is not None:
            out["knowledge_label"] = str(out["knowledge_label"]).strip()

        raw_chunks = out.get("cited_chunks")
        if isinstance(raw_chunks, list):
            coerced = [_coerce_chunk_ref(c) for c in raw_chunks]
            out["cited_chunks"] = [c for c in coerced if c is not None]
        else:
            out["cited_chunks"] = []
        return out


class TutorChatRequest(BaseModel):
    # Optional: None / "" / omitted => Standalone Accountancy Mode (No PDF required)
    document_id: Optional[str] = None
    question: str = Field(..., min_length=2, max_length=1500)
    conversation_id: Optional[str] = None

    @field_validator("document_id", "conversation_id", mode="before")
    @classmethod
    def _blank_to_none(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


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
