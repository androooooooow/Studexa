# StudyMate AI

StudyMate AI is a public, free-to-use AI study assistant web application. Students can upload course materials (PDF and DOCX), generate summaries, quizzes, flashcards, and practice exams, and ask questions through an AI tutor—all isolated per anonymous browser session without any signup or login.

## Architecture Highlights
- **Frontend**: React 19, Vite, Tailwind CSS, Axios, React Router (hosted on Vercel Hobby plan)
- **Backend**: Python, FastAPI, Uvicorn (`--workers 1`), Pydantic Settings, SQLite + `aiosqlite`
- **Retrieval**: SQLite FTS5 full-text search (`document_chunks_fts` with BM25 ranking; lightweight, zero external vector DB)
- **AI Engine**: Local Ollama running `gemma3:1b` (`127.0.0.1:11434`), serialized via a persistent SQLite FIFO job queue (max 1 active AI job globally, max 10 queued)
- **Anonymous Sessions**: Cryptographically random 256-bit token generated per browser; only its `SHA-256` hash is stored in SQLite

## Implementation Status
- **Phase 1 — Foundation**: Completed & Tested
- **Phase 2 — Documents & SQLite FTS5 Retrieval**: Completed & Tested
- **Phase 3 — AI Queue & Local Ollama (`gemma3:1b`)**: Completed & Tested
- **Phase 4 — Study Tools**: Completed & Tested
  - **AI Summarizer** (`/api/summaries/generate`, `/api/summaries`): Short, medium, and detailed structured summaries grounded in uploaded excerpts
  - **AI Quiz Generator** (`/api/quizzes/generate`, `/api/quizzes`, `/api/quizzes/{quiz_id}/submit`): Multiple-choice questions with hidden answer keys and deterministic Python grading
  - **Flashcards** (`/api/flashcards/generate`, `/api/flashcards`): Interactive Q&A decks with flip, shuffle, restart, and source chunk links
  - **AI Study Tutor** (`/api/tutor/chat`, `/api/tutor/conversations`, `/api/tutor/conversations/{id}`): FTS5 retrieval + explicit source-grounded vs. general-knowledge badges
  - **Exam Simulation** (`/api/exams/generate`, `/api/exams`, `/api/exams/{exam_id}/submit`, `/api/exams/attempts`): Full practice exams with deterministic Python score/percentage calculation
- **Phase 5 — Productivity & Exports**: Completed & Tested
  - **Study Planner** (`GET/POST/PATCH/DELETE /api/planner/tasks`)
  - **Progress Tracker** (`/api/progress/overview`, `/api/progress/activity`)
  - **Study Library & PDF Export** (`GET/DELETE /api/exports`, `GET /api/exports/{file_id}` via `ReportLab`)
- **Phase 6 — Security & Quality Hardening**: Completed & Tested
  - Cross-session ownership enforcement across all private endpoints
  - Controlled single-repair JSON validation for malformed AI output
  - Per-IP and per-session sliding-window rate limiters
  - Online SQLite & storage backup script (`deployment/backup_studymate.sh`)
- **Phase 7 — Production Deployment**: Ready for OCI VM & Vercel deployment (`deployment/README.md`)

## Running Locally

### 1. Backend (FastAPI)
```powershell
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

### 2. Run Automated Backend Test Suite
```powershell
.\backend\.venv\Scripts\python.exe -m pytest -v
```

### 3. Frontend (React + Vite)
```powershell
cd frontend
npm run dev
```
Open `http://localhost:5173`. Vite proxies `/api` requests to `http://127.0.0.1:8000` in development.
