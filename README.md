# StudyMate AI

StudyMate AI is a public, free-to-use AI study assistant web application. Students can upload course materials (PDF and DOCX), generate summaries, quizzes, flashcards, and practice exams, and ask questions through an AI tutor—all isolated per anonymous browser session without any signup or login.

## Architecture Highlights
- **Frontend**: React 19, Vite, Tailwind CSS, Axios, React Router (hosted on Vercel Hobby plan)
- **Backend**: Python, FastAPI, Uvicorn (`--workers 1`), Pydantic Settings, SQLite + `aiosqlite`
- **Retrieval**: SQLite FTS5 full-text search (`document_chunks_fts` with BM25 ranking; lightweight, zero external vector DB)
- **AI Engine**: Local Ollama running `gemma3:1b` (`127.0.0.1:11434`), serialized via a persistent SQLite FIFO job queue (max 1 active AI job globally, max 10 queued)
- **Anonymous Sessions**: Cryptographically random 256-bit token generated per browser; only its `SHA-256` hash is stored in SQLite

## Implementation Status
- **Phase 1 (Foundation)**: Completed & Tested
- **Phase 2 (Documents & SQLite FTS5 Retrieval)**: Completed & Tested
  - `POST /api/documents/upload`, `GET /api/documents`, `GET /api/documents/{document_id}`, `DELETE /api/documents/{document_id}`
  - Magic-byte, MIME-type, extension (`.pdf`, `.docx`), and 20 MB size validation + path traversal protection
  - Text extraction via `PyMuPDF` and `python-docx`, scanned/image-only PDF detection with OCR notice, chunking, and SQLite FTS5 indexing
- **Phase 3 (AI Queue & Local Ollama `gemma3:1b`)**: Completed & Tested
  - `POST /api/ai/jobs`, `GET /api/ai/jobs`, `GET /api/ai/jobs/{job_id}`, `DELETE /api/ai/jobs/{job_id}`
  - Single-worker FIFO SQLite queue (`AI_MAX_CONCURRENT=1`, `AI_MAX_QUEUE=10`), startup recovery of stranded `processing` jobs, failure/timeout isolation, and live frontend polling via `JobQueuePanel`
- **Phase 4 (Study Tools — Summarizer, Quizzes, Flashcards, Tutor, Exam Simulation)**: Next phase
- **Phase 5 (Productivity — Study Planner, Progress Tracker, Study Library, PDF Export)**: Pending
- **Phase 6 (Security & Quality Hardening)**: Pending
- **Phase 7 (Deployment)**: Pending

## Running Locally

### 1. Backend (FastAPI)
```powershell
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

### 2. Run Backend Tests
```powershell
.\backend\.venv\Scripts\python.exe -m pytest -v
```

### 3. Frontend (React + Vite)
```powershell
cd frontend
npm run dev
```
Open `http://localhost:5173`. Vite proxies `/api` requests to `http://127.0.0.1:8000` in development.
