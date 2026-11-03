from contextlib import asynccontextmanager
import logging
import aiosqlite
from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.api.documents import router as documents_router
from app.api.exams import router as exams_router
from app.api.exports import router as exports_router
from app.api.flashcards import router as flashcards_router
from app.api.jobs import router as jobs_router
from app.api.planner import router as planner_router
from app.api.progress import router as progress_router
from app.api.quizzes import router as quizzes_router
from app.api.reviewers import router as reviewers_router
from app.api.sessions import router as sessions_router
from app.api.summaries import router as summaries_router
from app.api.tutor import router as tutor_router
from app.config import settings
from app.database import get_db, init_db
from app.security.sessions import utc_now
from app.workers.ai_worker import ai_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s in %s mode", settings.APP_NAME, settings.ENVIRONMENT)
    await init_db()
    await ai_worker.start()
    yield
    await ai_worker.stop()
    logger.info("Shutting down %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Study assistant backend powered by Google Gemma on Cloudflare Workers AI and local Ollama.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Session-Token", "Authorization"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


app.include_router(sessions_router)
app.include_router(documents_router)
app.include_router(jobs_router)
app.include_router(summaries_router)
app.include_router(reviewers_router)
app.include_router(quizzes_router)
app.include_router(flashcards_router)
app.include_router(tutor_router)
app.include_router(exams_router)
app.include_router(planner_router)
app.include_router(progress_router)
app.include_router(exports_router)


@app.get("/api/health", tags=["health"])
@app.get("/api/health/", tags=["health"], include_in_schema=False)
@app.get("/health", tags=["health"])
@app.get("/health/", tags=["health"], include_in_schema=False)
async def health_check(db: aiosqlite.Connection = Depends(get_db)):
    """Check API health, SQLite connectivity, and configured AI queue settings."""
    cursor = await db.execute("SELECT 1 AS ok")
    row = await cursor.fetchone()
    db_ok = bool(row and row["ok"] == 1)

    q_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM ai_jobs WHERE status IN ('queued', 'processing')"
    )
    q_row = await q_cursor.fetchone()
    active_or_queued = q_row["cnt"] if q_row else 0

    return {
        "status": "ok" if db_ok else "degraded",
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "database": "connected" if db_ok else "error",
        "ai_provider": settings.active_ai_provider,
        "ai_model": settings.active_ai_model,
        "ai_max_concurrent": settings.AI_MAX_CONCURRENT,
        "ai_max_queue": settings.AI_MAX_QUEUE,
        "ai_queue_depth": active_or_queued,
        "timestamp": utc_now().isoformat(),
    }
