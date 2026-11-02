import json
import logging
import re
from typing import Any, Dict, List, Optional, Type, TypeVar
import aiosqlite
import httpx
from pydantic import BaseModel, ValidationError
from app.config import settings
from app.services.retrieval_service import retrieve_relevant_chunks

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
MAX_PROMPT_SOURCE_CHARS = 4500


class OllamaGenerationError(Exception):
    """Raised when local Ollama fails or returns an unrecoverable malformed response."""


def extract_json_from_text(raw_text: str) -> Dict[str, Any]:
    """
    Extract and parse a JSON object from LLM output, stripping markdown code fences if present.
    """
    cleaned = (raw_text or "").strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    else:
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace : last_brace + 1]

    return json.loads(cleaned)


async def generate_with_ollama(
    prompt: str,
    system_prompt: Optional[str] = None,
    expect_json: bool = False,
    timeout_seconds: float = 90.0,
) -> str:
    """
    Send a single generation request to local Ollama (127.0.0.1:11434) running gemma3:1b.
    The caller (ai_worker) guarantees at most 1 concurrent call globally.
    """
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    url = f"{base_url}/api/generate"

    payload: Dict[str, Any] = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.25,
            "num_predict": 1536,
        },
    }
    if system_prompt:
        payload["system"] = system_prompt
    if expect_json:
        payload["format"] = "json"

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(url, json=payload)
    except httpx.TimeoutException as exc:
        raise OllamaGenerationError(
            "Local AI generation timed out. Please try a shorter prompt or smaller section."
        ) from exc
    except httpx.RequestError as exc:
        raise OllamaGenerationError(
            f"Could not connect to local Ollama service at {base_url}. "
            f"Ensure Ollama is running locally and '{settings.OLLAMA_MODEL}' is pulled."
        ) from exc

    if response.status_code != 200:
        detail = response.text[:300]
        raise OllamaGenerationError(
            f"Ollama returned HTTP {response.status_code}: {detail}"
        )

    data = response.json()
    output_text = (data.get("response") or "").strip()
    if not output_text:
        raise OllamaGenerationError("Ollama returned an empty response.")

    return output_text


async def generate_and_validate_json(
    prompt: str,
    system_prompt: str,
    schema_model: Type[T],
    schema_hint: str,
) -> T:
    """
    Generate JSON from local Ollama and validate against `schema_model` (Pydantic).
    If the initial response is malformed or fails validation, attempt ONE controlled repair.
    Never loops indefinitely.
    """
    raw_output = await generate_with_ollama(
        prompt=prompt,
        system_prompt=system_prompt,
        expect_json=True,
    )

    try:
        parsed = extract_json_from_text(raw_output)
        return schema_model.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError, ValueError) as first_err:
        logger.warning(
            "Initial LLM JSON output failed validation (%s); attempting 1 controlled repair.",
            first_err,
        )

    repair_prompt = (
        "Your previous response was not valid JSON matching the required schema.\n"
        f"Required JSON schema structure:\n{schema_hint}\n\n"
        f"Previous invalid output:\n{raw_output[:2000]}\n\n"
        "Return ONLY valid JSON matching the required schema structure and nothing else."
    )
    repaired_raw = await generate_with_ollama(
        prompt=repair_prompt,
        system_prompt="You are a strict JSON repair assistant. Output only valid JSON.",
        expect_json=True,
    )
    try:
        repaired_parsed = extract_json_from_text(repaired_raw)
        return schema_model.model_validate(repaired_parsed)
    except (json.JSONDecodeError, ValidationError, ValueError) as second_err:
        raise OllamaGenerationError(
            f"Model output did not match required JSON format after 1 repair attempt: {second_err}"
        ) from second_err


async def build_bounded_source_context(
    db: aiosqlite.Connection,
    session_id: str,
    document_id: str,
    query: str = "",
    max_chunks: int = 6,
    max_chars: int = MAX_PROMPT_SOURCE_CHARS,
) -> tuple[str, List[int], str]:
    """
    Retrieve relevant chunks from SQLite FTS5 for (session_id, document_id) and bound total text length.
    Returns (excerpts_text, chunk_numbers_1_based, document_filename).
    """
    doc_cur = await db.execute(
        "SELECT original_filename FROM documents WHERE id = ? AND session_id = ?",
        (document_id, session_id),
    )
    doc_row = await doc_cur.fetchone()
    doc_name = doc_row["original_filename"] if doc_row else "Study Document"

    chunks = await retrieve_relevant_chunks(
        db=db,
        session_id=session_id,
        document_id=document_id,
        query=query,
        limit=max_chunks,
    )

    parts: List[str] = []
    chunk_refs: List[int] = []
    used_chars = 0

    for ch in chunks:
        idx_1 = ch["chunk_index"] + 1
        text = ch["chunk_text"].strip()
        if not text:
            continue
        remaining = max_chars - used_chars
        if remaining <= 0:
            break
        snippet = text[:remaining]
        parts.append(f"[Chunk #{idx_1}]\n{snippet}")
        chunk_refs.append(idx_1)
        used_chars += len(snippet)

    return "\n\n".join(parts), chunk_refs, doc_name
