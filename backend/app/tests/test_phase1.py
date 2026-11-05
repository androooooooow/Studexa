from datetime import timedelta
import aiosqlite
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from app.config import settings
from app.database import init_db
from app.main import app
from app.security.rate_limit import session_action_limiter, session_create_limiter
from app.security.sessions import hash_session_token, to_iso, utc_now


@pytest_asyncio.fixture(autouse=True)
async def setup_test_environment(tmp_path, monkeypatch):
    """Isolate each test with a temporary SQLite database and reset rate limiters."""
    db_file = tmp_path / "test_studymate.db"
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
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["database"] == "connected"
        assert data["ai_model"] == "gemma3:1b"
        assert data["ai_max_concurrent"] == settings.AI_MAX_CONCURRENT
        assert data["ai_max_queue"] == settings.AI_MAX_QUEUE
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert res.headers.get("X-Frame-Options") == "DENY"


@pytest.mark.asyncio
async def test_create_and_validate_anonymous_session():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create session
        create_res = await client.post("/api/session")
        assert create_res.status_code == 201
        created = create_res.json()
        raw_token = created["session_token"]
        session_id = created["session_id"]
        assert len(raw_token) >= 32

        # 2. Verify raw token is NOT stored in SQLite (only its SHA-256 hash)
        async with aiosqlite.connect(settings.sqlite_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT id, token_hash FROM sessions WHERE id = ?", (session_id,))
            row = await cursor.fetchone()
            assert row is not None
            assert row["token_hash"] != raw_token
            assert row["token_hash"] == hash_session_token(raw_token)

        # 3. Validate session via GET /api/session/me
        me_res = await client.get(
            "/api/session/me", headers={"X-Session-Token": raw_token}
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["session_id"] == session_id
        assert "session_token" not in me_data
        assert me_data["stats"]["document_count"] == 0


@pytest.mark.asyncio
async def test_reject_missing_invalid_or_expired_session_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing token
        missing_res = await client.get("/api/session/me")
        assert missing_res.status_code == 401

        # Invalid token
        invalid_res = await client.get(
            "/api/session/me",
            headers={"X-Session-Token": "invalid_token_value_that_does_not_exist_12345"},
        )
        assert invalid_res.status_code == 401

        # Create valid session, then expire it in DB
        create_res = await client.post("/api/session")
        raw_token = create_res.json()["session_token"]
        session_id = create_res.json()["session_id"]

        past_iso = to_iso(utc_now() - timedelta(days=1))
        async with aiosqlite.connect(settings.sqlite_path) as db:
            await db.execute(
                "UPDATE sessions SET expires_at = ? WHERE id = ?",
                (past_iso, session_id),
            )
            await db.commit()

        expired_res = await client.get(
            "/api/session/me", headers={"X-Session-Token": raw_token}
        )
        assert expired_res.status_code == 401


@pytest.mark.asyncio
async def test_two_sessions_are_isolated():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res_a = await client.post("/api/session")
        res_b = await client.post("/api/session")
        session_a = res_a.json()
        session_b = res_b.json()

        assert session_a["session_id"] != session_b["session_id"]
        assert session_a["session_token"] != session_b["session_token"]

        # Insert a document belonging to Session A directly to verify stats isolation
        async with aiosqlite.connect(settings.sqlite_path) as db:
            await db.execute(
                """
                INSERT INTO documents (id, session_id, original_filename, stored_filename, file_type, file_size, extracted_text_status, created_at)
                VALUES ('doc-1', ?, 'notes.pdf', 'safe_1.pdf', 'pdf', 1024, 'completed', ?)
                """,
                (session_a["session_id"], to_iso(utc_now())),
            )
            await db.commit()

        me_a = await client.get(
            "/api/session/me", headers={"X-Session-Token": session_a["session_token"]}
        )
        me_b = await client.get(
            "/api/session/me", headers={"X-Session-Token": session_b["session_token"]}
        )

        assert me_a.json()["stats"]["document_count"] == 1
        assert me_b.json()["stats"]["document_count"] == 0
