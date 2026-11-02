# StudyMate AI

StudyMate AI is a public, free-to-use AI study assistant web application. Students can upload course materials (PDF and DOCX), generate summaries, quizzes, flashcards, and practice exams, and ask questions through an AI tutor—all isolated per anonymous browser session without any signup or login.

## Architecture Highlights
- **Frontend**: React 19, Vite, Tailwind CSS, Axios, React Router (hosted on Vercel Hobby plan)
- **Backend**: Python, FastAPI, Uvicorn (`--workers 1`), Pydantic Settings, SQLite + `aiosqlite`
- **Retrieval**: SQLite FTS5 full-text search (lightweight, zero external vector DB)
- **AI Engine**: Local Ollama running `gemma3:1b` (`127.0.0.1:11434`), serialized via a persistent SQLite FIFO job queue (max 1 active AI job globally, max 10 queued)
- **Anonymous Sessions**: Cryptographically random 256-bit token generated per browser; only its `SHA-256` hash is stored in SQLite

## Implementation Status
- **Phase 1 (Foundation)**: Completed & Tested
  - Repository structure (`frontend/`, `backend/`, `deployment/`)
  - FastAPI `/api/health`, `POST /api/session`, and `GET /api/session/me`
  - SQLite database schema initialization (all 11 tables including `document_chunks_fts` FTS5 virtual table and sync triggers)
  - Cryptographic anonymous session creation, SHA-256 token hashing, TTL expiration, and rate limiting
  - React + Vite + Tailwind frontend with `LandingPage`, `Dashboard`, live backend/session synchronization, and routed views
- **Phase 2 (Documents)**: Pending approval to start
- **Phase 3 (AI Queue & Ollama)**: Pending
- **Phase 4 (Study Tools)**: Pending
- **Phase 5 (Productivity & Exports)**: Pending
- **Phase 6 (Security & Quality Hardening)**: Pending
- **Phase 7 (Deployment)**: Pending

## Running Locally

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

### 2. Run Backend Tests
```bash
cd backend
.\.venv\Scripts\pytest -v
```

### 3. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. Vite proxies `/api` requests to `http://127.0.0.1:8000` in development.
