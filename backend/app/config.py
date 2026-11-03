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
    AI_PROVIDER: str = "ollama"  # "cloudflare" or "ollama"
    CLOUDFLARE_ACCOUNT_ID: str = ""
    CLOUDFLARE_API_TOKEN: str = ""
    CLOUDFLARE_MODEL: str = "@cf/google/gemma-7b-it"
    AI_MAX_CONCURRENT: int = 2
    AI_MAX_QUEUE: int = 20
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
        raw = self.CORS_ORIGINS or ""
        if raw.strip() == "*":
            return ["*"]
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        return origins if origins else ["*"]

    @property
    def active_ai_provider(self) -> str:
        prov = (self.AI_PROVIDER or "").lower().strip()
        if prov == "cloudflare":
            return "cloudflare"
        if bool(self.CLOUDFLARE_ACCOUNT_ID and self.CLOUDFLARE_API_TOKEN):
            return "cloudflare"
        return "ollama"

    @property
    def active_ai_model(self) -> str:
        if self.active_ai_provider == "cloudflare":
            return self.CLOUDFLARE_MODEL or "@cf/google/gemma-7b-it"
        return self.OLLAMA_MODEL


settings = Settings()
