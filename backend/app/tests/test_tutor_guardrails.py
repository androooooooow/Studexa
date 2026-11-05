"""
AI Study Tutor guardrails: all academic subjects allowed, greetings handled warmly,
clearly non-academic questions rejected (keyword pre-filter + model OFF_TOPIC sentinel).
"""
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from app.config import settings
from app.database import init_db
from app.main import app
from app.schemas.study_tools import TutorLLMOutput
from app.security.rate_limit import session_action_limiter, session_create_limiter
from app.services import ollama_service
from app.services.tutor_service import (
    OFF_TOPIC_REJECTION_MESSAGE,
    classify_small_talk,
    is_off_topic_model_reply,
    validate_study_question,
)
from app.workers.ai_worker import ai_worker


@pytest_asyncio.fixture
async def setup_test_environment(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{(tmp_path / 'tutor.db').as_posix()}")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "GENERATED_DIR", str(tmp_path / "generated"))
    session_create_limiter.reset()
    session_action_limiter.reset()
    await init_db()
    yield
    await ai_worker.stop()


# -------------------- Unit: small-talk classifier --------------------
@pytest.mark.parametrize(
    "message, expected_intent",
    [
        ("hi", "greeting"),
        ("Hello!", "greeting"),
        ("Good day", "greeting"),
        ("good morning po", "greeting"),
        ("hey there 👋", "greeting"),
        ("Who are you?", "identity"),
        ("what can you do?", "capabilities"),
        ("Thank you!", "thanks"),
        ("thanks so much tutor", "thanks"),
        ("How are you today?", "wellbeing"),
        ("bye!", "farewell"),
    ],
)
def test_greetings_and_small_talk_are_detected(message, expected_intent):
    intents = classify_small_talk(message)
    assert intents is not None and expected_intent in intents
    validate_study_question(message)  # must not raise


def test_combined_greeting_intents():
    assert classify_small_talk("Hi! Who are you and what can you do?") == {
        "greeting",
        "identity",
        "capabilities",
    }


@pytest.mark.parametrize(
    "message",
    [
        "Hello! How does photosynthesis work?",
        "hi can you explain mitosis",
        "Can you help me with quadratic equations?",
        "This is the history of the world",
    ],
)
def test_greeting_plus_real_question_is_not_small_talk(message):
    assert classify_small_talk(message) is None


# -------------------- Unit: academic scope & off-topic filter --------------------
@pytest.mark.parametrize(
    "question",
    [
        "How does photosynthesis work?",
        "How do you solve systems of linear equations using substitution?",
        "What were the primary causes and consequences of World War I?",
        "Explain the core principles of Object-Oriented Programming (OOP).",
        "Write a Python script that sorts a list using bubble sort.",
        "Explain the difference between accrual and cash basis accounting.",
        "How does radiocarbon dating determine the age of fossils?",
        "Analyze Netflix's business model using Porter's Five Forces.",
        "Explain the physics of a basketball free throw.",
        "Help me outline an essay on climate change.",
    ],
)
def test_academic_questions_across_subjects_are_allowed(question):
    validate_study_question(question)  # must not raise
    assert classify_small_talk(question) is None


@pytest.mark.parametrize(
    "question",
    [
        "What is the best build in Valorant?",
        "Give me a recipe for chocolate cake",
        "Any celebrity gossip about Taylor Swift?",
        "Who should I vote for in the next election?",
        "What's my horoscope for today?",
        "Recommend a k-drama to binge",
    ],
)
def test_non_academic_questions_are_rejected(question):
    with pytest.raises(HTTPException) as exc_info:
        validate_study_question(question)
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == OFF_TOPIC_REJECTION_MESSAGE


def test_model_off_topic_sentinel_detection():
    assert is_off_topic_model_reply("OFF_TOPIC")
    assert is_off_topic_model_reply("  **OFF_TOPIC**")
    assert not is_off_topic_model_reply("Photosynthesis converts light energy into chemical energy.")


def test_legacy_accountancy_flag_is_still_accepted():
    legacy = TutorLLMOutput.model_validate({"answer": "x", "is_accountancy_related": "false"})
    assert legacy.is_study_related is False


# -------------------- End-to-end through API + worker --------------------
async def _new_client_session(client: AsyncClient) -> dict:
    token = (await client.post("/api/session")).json()["session_token"]
    return {"X-Session-Token": token}


async def _ask(client: AsyncClient, headers: dict, question: str):
    return await client.post(
        "/api/tutor/chat",
        json={"document_id": None, "question": question},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_greeting_gets_warm_reply_without_model_call(setup_test_environment, monkeypatch):
    calls = []

    async def fake_generate(prompt, system_prompt=None, expect_json=False, timeout_seconds=90.0):
        calls.append(prompt)
        return "should not be used"

    monkeypatch.setattr(ollama_service, "generate_with_ollama", fake_generate)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _new_client_session(client)
        for greeting in ("Hello!", "Good day"):
            res = await _ask(client, headers, greeting)
            assert res.status_code == 202, res.text
            job_id = res.json()["id"]
            conv_id = res.json()["payload"]["options"]["conversation_id"]
            await ai_worker.process_one_job()

            job_res = await client.get(f"/api/ai/jobs/{job_id}", headers=headers)
            assert job_res.status_code == 200, job_res.text
            job = job_res.json()
            assert job["status"] == "completed", job
            detail = (
                await client.get(f"/api/tutor/conversations/{conv_id}", headers=headers)
            ).json()
            reply = detail["messages"][-1]["content"]
            assert "Welcome to Studexa" in reply
            assert "What would you like to study today?" in reply

    assert calls == []  # deterministic: no model call for greetings


@pytest.mark.asyncio
async def test_science_question_uses_standalone_general_academic_mode(setup_test_environment, monkeypatch):
    captured = {}

    async def fake_generate(prompt, system_prompt=None, expect_json=False, timeout_seconds=90.0):
        captured["prompt"] = prompt
        captured["system_prompt"] = system_prompt
        return (
            "Photosynthesis is the process by which plants convert light energy, water, and carbon "
            "dioxide into glucose and oxygen. It happens in two stages: the light-dependent reactions "
            "in the thylakoids and the Calvin cycle in the stroma."
        )

    monkeypatch.setattr(ollama_service, "generate_with_ollama", fake_generate)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _new_client_session(client)
        res = await _ask(client, headers, "How does photosynthesis work?")
        assert res.status_code == 202, res.text
        conv_id = res.json()["payload"]["options"]["conversation_id"]
        await ai_worker.process_one_job()

        detail = (await client.get(f"/api/tutor/conversations/{conv_id}", headers=headers)).json()
        assistant = detail["messages"][-1]
        assert "Calvin cycle" in assistant["content"]
        assert assistant["metadata"]["source_grounded"] is False
        assert assistant["metadata"]["knowledge_label"] == "General Academic Knowledge"

    assert "Mode: Standalone Study Tutor (no PDF uploaded)." in captured["prompt"]
    assert "<SOURCE_EXCERPTS>" not in captured["prompt"]
    system_prompt = captured["system_prompt"]
    assert "ALL subjects" in system_prompt
    assert "OFF_TOPIC" in system_prompt
    for removed in ("CPA", "RFBT", "Accountancy professor"):
        assert removed not in system_prompt


@pytest.mark.asyncio
async def test_valorant_question_is_rejected_with_off_topic_notice(setup_test_environment, monkeypatch):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _new_client_session(client)
        res = await _ask(client, headers, "What is the best build in Valorant?")
        assert res.status_code == 400
        assert res.json()["detail"] == OFF_TOPIC_REJECTION_MESSAGE


@pytest.mark.asyncio
async def test_model_sentinel_fails_job_with_off_topic_notice(setup_test_environment, monkeypatch):
    async def fake_generate(prompt, system_prompt=None, expect_json=False, timeout_seconds=90.0):
        return "OFF_TOPIC"

    monkeypatch.setattr(ollama_service, "generate_with_ollama", fake_generate)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _new_client_session(client)
        # Not caught by the keyword pre-filter, so the model makes the call.
        res = await _ask(client, headers, "Which sneakers look coolest with jeans?")
        assert res.status_code == 202, res.text
        job_id = res.json()["id"]
        await ai_worker.process_one_job()

        job_res = await client.get(f"/api/ai/jobs/{job_id}", headers=headers)
        assert job_res.status_code == 200, job_res.text
        job = job_res.json()
        assert job["status"] == "failed"
        assert job["error_message"] == OFF_TOPIC_REJECTION_MESSAGE
