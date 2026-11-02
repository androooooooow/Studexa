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


@pytest_asyncio.fixture(autouse=True)
async def setup_test_environment(tmp_path, monkeypatch):
    db_file = tmp_path / "test_phase5.db"
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
async def test_study_planner_progress_tracker_and_pdf_export():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        token = s_res.json()["session_token"]
        session_id = s_res.json()["session_id"]
        headers = {"X-Session-Token": token}

        # 1. Create Planner Tasks
        t1 = await client.post(
            "/api/planner/tasks",
            json={
                "title": "Read Chapter 5 Notes",
                "description": "Focus on cellular metabolism",
                "due_date": "2026-11-15",
            },
            headers=headers,
        )
        assert t1.status_code == 201
        task_id = t1.json()["id"]
        assert t1.json()["completed"] is False

        # 2. Mark Task Complete via PATCH
        patched = await client.patch(
            f"/api/planner/tasks/{task_id}",
            json={"completed": True},
            headers=headers,
        )
        assert patched.status_code == 200
        assert patched.json()["completed"] is True

        # 3. Insert a generated summary material & verify PDF export via ReportLab
        now_iso = to_iso(utc_now())
        summary_payload = {
            "style": "medium",
            "source_chunks_used": [1],
            "summary": {
                "overview": "Summary overview for PDF export test.",
                "main_ideas": ["First key concept"],
                "key_terms": [{"term": "Mitosis", "definition": "Cell division"}],
                "important_details": ["Detail 1"],
            },
        }
        async with aiosqlite.connect(settings.sqlite_path) as db:
            await db.execute(
                """
                INSERT INTO generated_materials (id, session_id, document_id, material_type, title, content_json, created_at)
                VALUES ('mat-export-1', ?, NULL, 'summary', 'Biology Summary Export', ?, ?)
                """,
                (session_id, json.dumps(summary_payload), now_iso),
            )
            await db.commit()

        pdf_res = await client.get("/api/exports/mat-export-1", headers=headers)
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
        assert pdf_res.content.startswith(b"%PDF-")

        # 4. Verify Progress Overview & Activity Log
        ov_res = await client.get("/api/progress/overview", headers=headers)
        assert ov_res.status_code == 200
        ov = ov_res.json()
        assert ov["total_tasks"] == 1
        assert ov["completed_tasks"] == 1
        assert ov["pending_tasks"] == 0
        assert ov["material_counts_by_type"]["summary"] == 1

        act_res = await client.get("/api/progress/activity", headers=headers)
        assert act_res.status_code == 200
        assert len(act_res.json()["activities"]) >= 2

        # 5. Delete Task & Delete Library Material
        del_task = await client.delete(f"/api/planner/tasks/{task_id}", headers=headers)
        assert del_task.status_code == 204

        del_mat = await client.delete("/api/exports/mat-export-1", headers=headers)
        assert del_mat.status_code == 204
