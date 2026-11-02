import asyncio
import json
import aiosqlite
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from app.config import settings
from app.database import init_db
from app.main import app
from app.security.rate_limit import session_action_limiter, session_create_limiter
from app.security.sessions import to_iso, utc_now
from app.services.ollama_service import OllamaGenerationError
from app.workers import ai_worker as worker_module
from app.workers.ai_worker import ai_worker, recover_stranded_jobs


@pytest_asyncio.fixture(autouse=True)
async def setup_test_environment(tmp_path, monkeypatch):
    db_file = tmp_path / "test_phase3.db"
    uploads_dir = tmp_path / "uploads"
    generated_dir = tmp_path / "generated"

    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{db_file.as_posix()}")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(uploads_dir))
    monkeypatch.setattr(settings, "GENERATED_DIR", str(generated_dir))
    monkeypatch.setattr(settings, "AI_MAX_QUEUE", 10)

    session_create_limiter.reset()
    session_action_limiter.reset()

    await init_db()
    yield
    await ai_worker.stop()


@pytest.mark.asyncio
async def test_fifo_single_concurrency_and_failure_isolation(monkeypatch):
    """
    Verify that:
    1. Only 1 AI job runs at any time (max_active_observed == 1).
    2. Jobs execute in strict FIFO order.
    3. A failed job marks status='failed' and does NOT block subsequent queued jobs.
    """
    execution_order = []
    active_count = 0
    max_active_observed = 0

    async def fake_generate_with_ollama(prompt, system_prompt=None, expect_json=False, timeout_seconds=90.0):
        nonlocal active_count, max_active_observed
        active_count += 1
        max_active_observed = max(max_active_observed, active_count)
        await asyncio.sleep(0.03)
        active_count -= 1

        if "FAIL_THIS_JOB" in prompt:
            raise OllamaGenerationError("Simulated Ollama failure")
        execution_order.append(prompt.splitlines()[-1])
        return "Mocked Gemma 3 1B output"

    monkeypatch.setattr(worker_module.ollama_service, "generate_with_ollama", fake_generate_with_ollama)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        token = s_res.json()["session_token"]

        # Enqueue 3 jobs: Job 1 (ok), Job 2 (fails), Job 3 (ok)
        j1 = await client.post(
            "/api/ai/jobs",
            json={"job_type": "summary", "prompt": "JOB_1"},
            headers={"X-Session-Token": token},
        )
        j2 = await client.post(
            "/api/ai/jobs",
            json={"job_type": "summary", "prompt": "FAIL_THIS_JOB"},
            headers={"X-Session-Token": token},
        )
        j3 = await client.post(
            "/api/ai/jobs",
            json={"job_type": "summary", "prompt": "JOB_3"},
            headers={"X-Session-Token": token},
        )

        assert j1.status_code == 202
        assert j2.status_code == 202
        assert j3.status_code == 202

        # Process all 3 sequentially via worker
        assert await ai_worker.process_one_job() is True
        assert await ai_worker.process_one_job() is True
        assert await ai_worker.process_one_job() is True
        assert await ai_worker.process_one_job() is False

        assert max_active_observed == 1
        assert execution_order == ["Student request: JOB_1", "Student request: JOB_3"]

        # Check job statuses via API
        r1 = await client.get(f"/api/ai/jobs/{j1.json()['id']}", headers={"X-Session-Token": token})
        r2 = await client.get(f"/api/ai/jobs/{j2.json()['id']}", headers={"X-Session-Token": token})
        r3 = await client.get(f"/api/ai/jobs/{j3.json()['id']}", headers={"X-Session-Token": token})

        assert r1.json()["status"] == "completed"
        assert r2.json()["status"] == "failed"
        assert "Simulated Ollama failure" in r2.json()["error_message"]
        assert r3.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_queue_full_rejection_and_cancel_queued_job():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token_a = (await client.post("/api/session")).json()["session_token"]
        token_b = (await client.post("/api/session")).json()["session_token"]

        job_ids = []
        # Fill the queue up to AI_MAX_QUEUE (10)
        for i in range(10):
            res = await client.post(
                "/api/ai/jobs",
                json={"job_type": "summary", "prompt": f"Queued item {i}"},
                headers={"X-Session-Token": token_a},
            )
            assert res.status_code == 202
            job_ids.append(res.json()["id"])

        # 11th job must be rejected with 429 Too Many Requests
        overflow = await client.post(
            "/api/ai/jobs",
            json={"job_type": "summary", "prompt": "Overflow item"},
            headers={"X-Session-Token": token_b},
        )
        assert overflow.status_code == 429
        assert "queue is currently full" in overflow.json()["detail"]

        # Session B cannot cancel Session A's job
        forbidden_del = await client.delete(
            f"/api/ai/jobs/{job_ids[0]}", headers={"X-Session-Token": token_b}
        )
        assert forbidden_del.status_code == 404

        # Session A can cancel its own queued job, freeing 1 slot
        del_res = await client.delete(
            f"/api/ai/jobs/{job_ids[0]}", headers={"X-Session-Token": token_a}
        )
        assert del_res.status_code == 204

        # Now Session B can enqueue a job into the freed slot
        now_ok = await client.post(
            "/api/ai/jobs",
            json={"job_type": "summary", "prompt": "Now fits in queue"},
            headers={"X-Session-Token": token_b},
        )
        assert now_ok.status_code == 202


@pytest.mark.asyncio
async def test_recover_stranded_processing_jobs_on_restart():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        session_id = s_res.json()["session_id"]
        token = s_res.json()["session_token"]

        now_iso = to_iso(utc_now())
        # Insert a job stuck in 'processing' state as if the server crashed mid-generation
        async with aiosqlite.connect(settings.sqlite_path) as db:
            await db.execute(
                """
                INSERT INTO ai_jobs (id, session_id, job_type, payload_json, status, created_at, started_at)
                VALUES ('stranded-job-1', ?, 'summary', ?, 'processing', ?, ?)
                """,
                (session_id, json.dumps({"prompt": "Recover me"}), now_iso, now_iso),
            )
            await db.commit()

        recovered_count = await recover_stranded_jobs()
        assert recovered_count == 1

        check = await client.get(
            "/api/ai/jobs/stranded-job-1", headers={"X-Session-Token": token}
        )
        assert check.status_code == 200
        assert check.json()["status"] == "queued"
        assert check.json()["started_at"] is None
