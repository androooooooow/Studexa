import json
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from app.config import settings
from app.database import init_db
from app.main import app
from app.security.rate_limit import session_action_limiter, session_create_limiter
from app.services import ollama_service
from app.tests.test_phase2_documents import make_test_pdf_bytes
from app.workers.ai_worker import ai_worker


@pytest_asyncio.fixture(autouse=True)
async def setup_test_environment(tmp_path, monkeypatch):
    db_file = tmp_path / "test_phase4.db"
    uploads_dir = tmp_path / "uploads"
    generated_dir = tmp_path / "generated"

    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{db_file.as_posix()}")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(uploads_dir))
    monkeypatch.setattr(settings, "GENERATED_DIR", str(generated_dir))

    session_create_limiter.reset()
    session_action_limiter.reset()

    await init_db()
    yield
    await ai_worker.stop()


@pytest.mark.asyncio
async def test_summarizer_quiz_flashcards_tutor_and_exam_end_to_end(monkeypatch):
    """
    Verify all 5 Phase 4 study tools (Summarizer, Quiz + Deterministic Grading,
    Flashcards, Document-Grounded Tutor, and Exam Simulation + Deterministic Scoring).
    """

    async def fake_generate_with_ollama(
        prompt: str, system_prompt=None, expect_json=False, timeout_seconds=90.0
    ) -> str:
        if "summary" in (system_prompt or "").lower() or '"overview"' in prompt:
            return json.dumps(
                {
                    "overview": "Cellular respiration converts glucose into ATP inside mitochondria.",
                    "main_ideas": [
                        "Glycolysis occurs in the cytosol.",
                        "Oxidative phosphorylation occurs across the inner mitochondrial membrane.",
                    ],
                    "key_terms": [
                        {
                            "term": "ATP Synthase",
                            "definition": "Enzyme that synthesizes ATP using a proton gradient.",
                        }
                    ],
                    "important_details": ["Produces approximately 30-32 ATP per glucose molecule."],
                    "insufficient_source_note": None,
                }
            )
        if "flashcard" in (system_prompt or "").lower() or '"cards"' in prompt:
            return json.dumps(
                {
                    "cards": [
                        {
                            "question": "Where does glycolysis take place?",
                            "answer": "In the cytosol of the cell.",
                            "chunk_ref": 1,
                        },
                        {
                            "question": "What drives ATP synthase?",
                            "answer": "The proton motive force across the inner mitochondrial membrane.",
                            "chunk_ref": 1,
                        },
                    ]
                }
            )
        if "tutor" in (system_prompt or "").lower() or '"source_grounded"' in prompt:
            return json.dumps(
                {
                    "answer": "According to Chunk #1, oxidative phosphorylation produces ATP in the mitochondria.",
                    "source_grounded": True,
                    "knowledge_label": "Grounded in uploaded document",
                    "cited_chunks": [1],
                }
            )
        # Quiz or Exam
        return json.dumps(
            {
                "questions": [
                    {
                        "question": "Which organelle is responsible for oxidative phosphorylation?",
                        "options": ["Mitochondria", "Ribosome", "Golgi apparatus", "Lysosome"],
                        "correct_index": 0,
                        "explanation": "Chunk #1 states that oxidative phosphorylation occurs in mitochondria.",
                        "chunk_ref": 1,
                    },
                    {
                        "question": "What molecule is the primary energy currency produced?",
                        "options": ["DNA", "ATP", "RNA", "Cellulose"],
                        "correct_index": 1,
                        "explanation": "Adenosine triphosphate (ATP) is synthesized.",
                        "chunk_ref": 1,
                    },
                ]
            }
        )

    monkeypatch.setattr(ollama_service, "generate_with_ollama", fake_generate_with_ollama)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        token = s_res.json()["session_token"]
        headers = {"X-Session-Token": token}

        # Upload a source PDF
        pdf_bytes = make_test_pdf_bytes(
            "Mitochondria perform cellular respiration and oxidative phosphorylation to synthesize ATP."
        )
        up_res = await client.post(
            "/api/documents/upload",
            files={"file": ("bio101.pdf", pdf_bytes, "application/pdf")},
            headers=headers,
        )
        doc_id = up_res.json()["id"]

        # 1. Summarizer
        sum_job = await client.post(
            "/api/summaries/generate",
            json={"document_id": doc_id, "style": "medium"},
            headers=headers,
        )
        assert sum_job.status_code == 202
        await ai_worker.process_one_job()

        summaries = (await client.get("/api/summaries", headers=headers)).json()
        assert len(summaries) == 1
        assert "ATP" in summaries[0]["content"]["overview"]

        # 2. Quiz Generator (supports 20, 50, 70, 100 questions) & Hidden Answer Key + Deterministic Grading
        quiz_job = await client.post(
            "/api/quizzes/generate",
            json={"document_id": doc_id, "question_count": 2, "difficulty": "medium"},
            headers=headers,
        )
        assert quiz_job.status_code == 202
        await ai_worker.process_one_job()

        quizzes = (await client.get("/api/quizzes", headers=headers)).json()
        assert len(quizzes) == 1
        quiz_id = quizzes[0]["id"]
        # Verify answer key is hidden before submission
        assert quizzes[0]["questions"][0]["correct_index"] is None
        assert quizzes[0]["questions"][0]["explanation"] is None

        # Submit 1 correct (Q0 -> 0) and 1 wrong (Q1 -> 0 instead of 1) => 1/2 = 50.0%
        grade_res = await client.post(
            f"/api/quizzes/{quiz_id}/submit",
            json={"answers": {"0": 0, "1": 0}},
            headers=headers,
        )
        assert grade_res.status_code == 200
        graded = grade_res.json()
        assert graded["score"] == 1
        assert graded["total_questions"] == 2
        assert graded["percentage"] == 50.0
        assert graded["reviews"][0]["is_correct"] is True
        assert graded["reviews"][1]["is_correct"] is False
        assert "mitochondria" in graded["reviews"][0]["explanation"].lower()

        # 3. Flashcards (supports 20, 50, 70, 100 cards)
        fc_job = await client.post(
            "/api/flashcards/generate",
            json={"document_id": doc_id, "card_count": 70},
            headers=headers,
        )
        assert fc_job.status_code == 202
        await ai_worker.process_one_job()

        decks = (await client.get("/api/flashcards", headers=headers)).json()
        assert len(decks) == 1
        assert len(decks[0]["cards"]) == 2

        # 4. AI Tutor (both with uploaded PDF AND without uploaded PDF, plus academic-only guardrail)
        tutor_job = await client.post(
            "/api/tutor/chat",
            json={
                "document_id": doc_id,
                "question": "How is depreciation computed in this document?",
            },
            headers=headers,
        )
        assert tutor_job.status_code == 202
        conv_id = tutor_job.json()["payload"]["options"]["conversation_id"]
        await ai_worker.process_one_job()

        conv_detail = (
            await client.get(f"/api/tutor/conversations/{conv_id}", headers=headers)
        ).json()
        assert len(conv_detail["messages"]) == 2
        assert conv_detail["messages"][0]["role"] == "user"
        assert conv_detail["messages"][1]["role"] == "assistant"
        assert conv_detail["messages"][1]["metadata"]["source_grounded"] is True

        # 4b. AI Tutor WITHOUT uploaded PDF (Standalone general-knowledge study question)
        captured_standalone_prompts = []
        orig_gen = ollama_service.generate_with_ollama

        async def spy_standalone_generate(prompt: str, system_prompt=None, expect_json=False, timeout_seconds=90.0) -> str:
            captured_standalone_prompts.append(prompt)
            return await orig_gen(prompt, system_prompt=system_prompt, expect_json=expect_json, timeout_seconds=timeout_seconds)

        monkeypatch.setattr(ollama_service, "generate_with_ollama", spy_standalone_generate)

        standalone_tutor = await client.post(
            "/api/tutor/chat",
            json={
                "document_id": None,
                "question": "Explain the difference between accrual accounting and cash basis accounting under PAS 1.",
            },
            headers=headers,
        )
        assert standalone_tutor.status_code == 202
        standalone_conv_id = standalone_tutor.json()["payload"]["options"]["conversation_id"]
        await ai_worker.process_one_job()

        assert len(captured_standalone_prompts) == 1
        assert "<SOURCE_EXCERPTS>" not in captured_standalone_prompts[0]
        assert "Mitochondria" not in captured_standalone_prompts[0]
        assert "Mode: Standalone Study Tutor (no PDF uploaded)." in captured_standalone_prompts[0]

        standalone_detail = (
            await client.get(f"/api/tutor/conversations/{standalone_conv_id}", headers=headers)
        ).json()
        assert len(standalone_detail["messages"]) == 2
        assert standalone_detail["messages"][1]["metadata"]["source_grounded"] is False

        # 4c. Off-topic non-academic question MUST be rejected with 400 error
        off_topic_res = await client.post(
            "/api/tutor/chat",
            json={
                "document_id": None,
                "question": "How do I cook chicken adobo and play Valorant?",
            },
            headers=headers,
        )
        assert off_topic_res.status_code == 400
        assert "academic and study questions only" in off_topic_res.json()["detail"]

        # 5. Exam Simulation (supports 20, 50, 70, 100 questions)
        exam_job = await client.post(
            "/api/exams/generate",
            json={"document_id": doc_id, "question_count": 2, "difficulty": "hard"},
            headers=headers,
        )
        assert exam_job.status_code == 202
        await ai_worker.process_one_job()

        exams = (await client.get("/api/exams", headers=headers)).json()
        assert len(exams) == 1
        exam_id = exams[0]["id"]

        exam_submit = await client.post(
            f"/api/exams/{exam_id}/submit",
            json={"answers": {"0": 0, "1": 1}},
            headers=headers,
        )
        assert exam_submit.status_code == 200
        assert exam_submit.json()["score"] == 2
        assert exam_submit.json()["percentage"] == 100.0

        attempts = (await client.get("/api/exams/attempts", headers=headers)).json()
        assert len(attempts) == 2  # 1 quiz attempt + 1 exam attempt
