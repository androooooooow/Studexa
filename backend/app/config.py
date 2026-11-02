import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_STORAGE_DIR = BASE_DIR / "storage"


class Settings(BaseSettings):
    APP_NAME: str = "StudyMate AI"
    ENVIRONMENT: str = "development"
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "gemma3:1b"
    AI_MAX_CONCURRENT: int = 1
    AI_MAX_QUEUE: int = 10
    DATABASE_URL: str = f"sqlite:///{(DEFAULT_STORAGE_DIR / 'database' / 'studymate.db').as_posix()}"
    UPLOAD_DIR: str = str(DEFAULT_STORAGE_DIR / "uploads")
    GENERATED_DIR: str = str(DEFAULT_STORAGE_DIR / "generated")
    MAX_UPLOAD_SIZE_MB: int = 20
    SESSION_TTL_DAYS: int = 30
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def sqlite_path(self) -> str:
        """Extract filesystem path from sqlite:/// or sqlite://// URL."""
        url = self.DATABASE_URL
        if url.startswith("sqlite:////"):
            # Absolute path on Unix or Windows drive if applicable
            raw = url[len("sqlite:///"):]
            # On Windows, sqlite:////C:/... or Unix sqlite:////opt/...
            if os.name == "nt" and len(raw) > 2 and raw[0] == "/" and raw[2] == ":":
                return raw[1:]
            return raw
        if url.startswith("sqlite:///"):
            return url[len("sqlite:///"):]
        return url

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
