import json
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from app.config import settings
from app.database import init_db
from app.main import app
from app.schemas.study_tools import SummaryContentSchema
from app.security.rate_limit import session_action_limiter, session_create_limiter
from app.services import ollama_service
from app.services.ollama_service import (
    OllamaGenerationError,
    generate_and_validate_json,
)


@pytest_asyncio.fixture(autouse=True)
async def setup_test_environment(tmp_path, monkeypatch):
    db_file = tmp_path / "test_phase6.db"
    uploads_dir = tmp_path / "uploads"
    generated_dir = tmp_path / "generated"

    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{db_file.as_posix()}")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(uploads_dir))
    monkeypatch.setattr(settings, "GENERATED_DIR", str(generated_dir))

    session_create_limiter.reset()
    session_action_limiter.reset()

    await init_db()
    yield


@pytest.mark.asyncio
async def test_malformed_ai_json_controlled_single_repair(monkeypatch):
    """
    Verify that if Ollama outputs malformed JSON first, generate_and_validate_json performs
    exactly ONE repair attempt and succeeds; and if the repair also fails, it raises
    OllamaGenerationError after at most 2 calls (never looping indefinitely).
    """
    call_count = 0

    async def fake_repair_succeeds(prompt, system_prompt=None, expect_json=False, timeout_seconds=90.0):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "NOT VALID JSON {broken"
        return json.dumps(
            {
                "overview": "Repaired valid JSON summary.",
                "main_ideas": ["Idea A"],
                "key_terms": [],
                "important_details": [],
            }
        )

    monkeypatch.setattr(ollama_service, "generate_with_ollama", fake_repair_succeeds)
    result = await generate_and_validate_json(
        prompt="Summarize",
        system_prompt="System",
        schema_model=SummaryContentSchema,
        schema_hint="{}",
    )
    assert call_count == 2
    assert result.overview == "Repaired valid JSON summary."

    # Now test when both attempts return invalid JSON: must stop at 2 calls and raise OllamaGenerationError
    call_count = 0

    async def fake_both_fail(prompt, system_prompt=None, expect_json=False, timeout_seconds=90.0):
        nonlocal call_count
        call_count += 1
        return "STILL BROKEN JSON"

    monkeypatch.setattr(ollama_service, "generate_with_ollama", fake_both_fail)
    with pytest.raises(OllamaGenerationError):
        await generate_and_validate_json(
            prompt="Summarize",
            system_prompt="System",
            schema_model=SummaryContentSchema,
            schema_hint="{}",
        )
    assert call_count == 2


@pytest.mark.asyncio
async def test_rate_limiting_and_cross_session_ownership_enforcement():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token_a = (await client.post("/api/session")).json()["session_token"]
        token_b = (await client.post("/api/session")).json()["session_token"]

        # Create a planner task under Session A
        t_res = await client.post(
            "/api/planner/tasks",
            json={"title": "Private Task A"},
            headers={"X-Session-Token": token_a},
        )
        task_id = t_res.json()["id"]

        # Session B cannot update or delete Session A's task
        patch_b = await client.patch(
            f"/api/planner/tasks/{task_id}",
            json={"completed": True},
            headers={"X-Session-Token": token_b},
        )
        assert patch_b.status_code == 404

        del_b = await client.delete(
            f"/api/planner/tasks/{task_id}",
            headers={"X-Session-Token": token_b},
        )
        assert del_b.status_code == 404

        # Verify IP rate limiter on POST /api/session triggers 429 when exceeded
        for _ in range(28):
            await client.post("/api/session")
        rate_limited = await client.post("/api/session")
        assert rate_limited.status_code == 429
