import io
import aiosqlite
import docx
import fitz
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from app.config import settings
from app.database import init_db
from app.main import app
from app.security.rate_limit import session_action_limiter, session_create_limiter
from app.services.retrieval_service import retrieve_relevant_chunks


def make_test_pdf_bytes(text: str = "") -> bytes:
    """Create a real in-memory PDF using PyMuPDF with optional text."""
    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((72, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def make_test_docx_bytes(paragraphs: list[str]) -> bytes:
    """Create a real in-memory DOCX using python-docx."""
    doc = docx.Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@pytest_asyncio.fixture(autouse=True)
async def setup_test_environment(tmp_path, monkeypatch):
    db_file = tmp_path / "test_phase2.db"
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
async def test_upload_valid_pdf_and_fts5_search():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        token = s_res.json()["session_token"]
        session_id = s_res.json()["session_id"]

        pdf_bytes = make_test_pdf_bytes(
            "Mitochondria are the powerhouses of the eukaryotic cell. "
            "Oxidative phosphorylation produces adenosine triphosphate (ATP) across the inner membrane."
        )

        files = {"file": ("biology_lecture.pdf", pdf_bytes, "application/pdf")}
        up_res = await client.post(
            "/api/documents/upload",
            files=files,
            headers={"X-Session-Token": token},
        )
        assert up_res.status_code == 201
        doc_data = up_res.json()
        assert doc_data["original_filename"] == "biology_lecture.pdf"
        assert doc_data["file_type"] == "pdf"
        assert doc_data["extracted_text_status"] == "completed"
        assert doc_data["chunk_count"] >= 1
        assert "stored_filename" not in doc_data

        # Verify FTS5 full-text search finds the chunk for this session
        async with aiosqlite.connect(settings.sqlite_path) as db:
            db.row_factory = aiosqlite.Row
            chunks = await retrieve_relevant_chunks(
                db=db,
                session_id=session_id,
                document_id=doc_data["id"],
                query="mitochondria adenosine triphosphate",
            )
            assert len(chunks) >= 1
            assert "Mitochondria" in chunks[0]["chunk_text"]


@pytest.mark.asyncio
async def test_upload_valid_docx_and_scanned_pdf_detection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        token = s_res.json()["session_token"]

        # 1. Valid DOCX
        docx_bytes = make_test_docx_bytes(
            [
                "Chapter 2: Constitutional Law and Separation of Powers.",
                "The legislative, executive, and judicial branches hold checks and balances.",
            ]
        )
        docx_res = await client.post(
            "/api/documents/upload",
            files={
                "file": (
                    "civics_notes.docx",
                    docx_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            headers={"X-Session-Token": token},
        )
        assert docx_res.status_code == 201
        assert docx_res.json()["extracted_text_status"] == "completed"
        assert docx_res.json()["chunk_count"] >= 1

        # 2. Scanned / Image-Only PDF (blank page with no text)
        blank_pdf = make_test_pdf_bytes("")
        scan_res = await client.post(
            "/api/documents/upload",
            files={"file": ("scanned_handout.pdf", blank_pdf, "application/pdf")},
            headers={"X-Session-Token": token},
        )
        assert scan_res.status_code == 201
        scan_data = scan_res.json()
        assert scan_data["extracted_text_status"] == "scanned_no_ocr"
        assert scan_data["chunk_count"] == 0
        assert "OCR is not included" in (scan_data["status_message"] or "")


@pytest.mark.asyncio
async def test_reject_invalid_extension_fake_header_and_path_traversal():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        s_res = await client.post("/api/session")
        token = s_res.json()["session_token"]

        # Disallowed .exe / .txt extension
        bad_ext = await client.post(
            "/api/documents/upload",
            files={"file": ("malware.exe", b"MZ1234", "application/octet-stream")},
            headers={"X-Session-Token": token},
        )
        assert bad_ext.status_code == 400

        # Fake PDF magic header
        fake_pdf = await client.post(
            "/api/documents/upload",
            files={"file": ("fake.pdf", b"NOT_A_PDF_FILE_CONTENT", "application/pdf")},
            headers={"X-Session-Token": token},
        )
        assert fake_pdf.status_code == 400

        # Path traversal attempt in filename is sanitized safely
        pdf_bytes = make_test_pdf_bytes("Safe content inside traversal filename test.")
        trav_res = await client.post(
            "/api/documents/upload",
            files={"file": ("../../etc/passwd.pdf", pdf_bytes, "application/pdf")},
            headers={"X-Session-Token": token},
        )
        assert trav_res.status_code == 201
        assert trav_res.json()["original_filename"] == "passwd.pdf"


@pytest.mark.asyncio
async def test_document_session_isolation_and_deletion():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token_a = (await client.post("/api/session")).json()["session_token"]
        token_b = (await client.post("/api/session")).json()["session_token"]

        pdf_bytes = make_test_pdf_bytes("Private study notes for Student A only.")
        up_a = await client.post(
            "/api/documents/upload",
            files={"file": ("student_a.pdf", pdf_bytes, "application/pdf")},
            headers={"X-Session-Token": token_a},
        )
        doc_id = up_a.json()["id"]

        # Student B cannot view or delete Student A's document
        list_b = await client.get("/api/documents", headers={"X-Session-Token": token_b})
        assert len(list_b.json()["documents"]) == 0

        get_b = await client.get(
            f"/api/documents/{doc_id}", headers={"X-Session-Token": token_b}
        )
        assert get_b.status_code == 404

        del_b = await client.delete(
            f"/api/documents/{doc_id}", headers={"X-Session-Token": token_b}
        )
        assert del_b.status_code == 404

        # Student A can view and delete their own document
        get_a = await client.get(
            f"/api/documents/{doc_id}", headers={"X-Session-Token": token_a}
        )
        assert get_a.status_code == 200
        assert len(get_a.json()["chunks"]) >= 1

        del_a = await client.delete(
            f"/api/documents/{doc_id}", headers={"X-Session-Token": token_a}
        )
        assert del_a.status_code == 200
        assert del_a.json() == {
            "success": True,
            "message": "Document deleted successfully",
        }

        after_a = await client.get("/api/documents", headers={"X-Session-Token": token_a})
        assert len(after_a.json()["documents"]) == 0

        # Verify chunks and FTS5 index entries are completely removed after deletion
        async with aiosqlite.connect(settings.sqlite_path) as db:
            db.row_factory = aiosqlite.Row
            s_a = (await client.get("/api/session/me", headers={"X-Session-Token": token_a})).json()
            rem_chunks = await retrieve_relevant_chunks(
                db=db,
                session_id=s_a["session_id"],
                document_id=doc_id,
                query="Private study notes",
            )
            assert rem_chunks == []
            fts_cur = await db.execute(
                "SELECT COUNT(*) AS cnt FROM document_chunks_fts WHERE document_chunks_fts MATCH 'Private'"
            )
            fts_row = await fts_cur.fetchone()
            assert fts_row["cnt"] == 0
