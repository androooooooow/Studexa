from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# -------------------- SUMMARIZER --------------------
class KeyTermItem(BaseModel):
    term: str
    definition: str


class SummaryContentSchema(BaseModel):
    overview: str
    main_ideas: List[str] = Field(default_factory=list)
    key_terms: List[KeyTermItem] = Field(default_factory=list)
    important_details: List[str] = Field(default_factory=list)
    insufficient_source_note: Optional[str] = None


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
    correct_index: int = Field(..., ge=0, le=5)
    explanation: str
    chunk_ref: Optional[int] = None


class MCQSetLLMOutput(BaseModel):
    questions: List[MCQQuestionFull] = Field(..., min_length=1)


class MCQQuestionPublic(BaseModel):
    question_index: int
    question: str
    options: List[str]
    chunk_ref: Optional[int] = None
    correct_index: Optional[int] = None
    explanation: Optional[str] = None


class QuizGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(default=5, ge=2, le=15)
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


class FlashcardLLMOutput(BaseModel):
    cards: List[FlashcardItem] = Field(..., min_length=1)


class FlashcardGenerateRequest(BaseModel):
    document_id: str
    card_count: int = Field(default=8, ge=3, le=20)


class FlashcardDeckResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    title: str
    cards: List[FlashcardItem]
    created_at: str


# -------------------- AI TUTOR --------------------
class TutorLLMOutput(BaseModel):
    answer: str
    source_grounded: bool = True
    knowledge_label: str = "Grounded in uploaded document"
    cited_chunks: List[int] = Field(default_factory=list)


class TutorChatRequest(BaseModel):
    document_id: str
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
    question_count: int = Field(default=10, ge=3, le=20)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class ExamAttemptItem(BaseModel):
    id: str
    exam_id: str
    exam_title: str
    score: int
    total_questions: int
    percentage: float
    created_at: str
