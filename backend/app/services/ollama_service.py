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
MAX_PROMPT_SOURCE_CHARS = 5500


class OllamaGenerationError(Exception):
    """Raised when Ollama or Cloudflare Workers AI fails or returns an unrecoverable malformed response."""


AIGenerationError = OllamaGenerationError


def extract_cf_response(data: Any) -> str:
    """
    Safely extract a string response from Cloudflare Workers AI or Ollama payloads.
    Handles string results, nested {"result": {"response": ...}} dicts,
    auto-parsed JSON dicts/lists inside "response", and OpenAI-compatible "choices".
    """
    if data is None:
        return ""
    if isinstance(data, str):
        return data.strip()
    if isinstance(data, dict):
        # If data has "result", unpack it first
        res = data.get("result", data)
        if res is None:
            return ""
        if isinstance(res, str):
            return res.strip()
        if isinstance(res, dict):
            for key in ("response", "text", "description", "output", "content"):
                if key in res and res[key] is not None:
                    val = res[key]
                    if isinstance(val, str):
                        return val.strip()
                    if isinstance(val, dict):
                        inner = val.get("response") or val.get("text")
                        if isinstance(inner, str) and set(val.keys()) <= {"response", "text"}:
                            return inner.strip()
                        return json.dumps(val, ensure_ascii=False).strip()
                    if isinstance(val, list):
                        return json.dumps(val, ensure_ascii=False).strip()
                    return str(val).strip()
            choices = res.get("choices")
            if isinstance(choices, list) and choices:
                first = choices[0]
                if isinstance(first, dict):
                    msg = first.get("message") if isinstance(first.get("message"), dict) else first
                    content = msg.get("content") if isinstance(msg, dict) else first.get("text")
                    if isinstance(content, str):
                        return content.strip()
                    if isinstance(content, (dict, list)):
                        return json.dumps(content, ensure_ascii=False).strip()
            return json.dumps(res, ensure_ascii=False).strip()
        if isinstance(res, list):
            return json.dumps(res, ensure_ascii=False).strip()
        return str(res).strip()
    if isinstance(data, list):
        return json.dumps(data, ensure_ascii=False).strip()
    return str(data).strip()


def _salvage_truncated_json_array(text: Any) -> Optional[Dict[str, Any]]:
    """
    If an LLM response containing a list of objects was cut off mid-generation,
    salvage all complete {...} objects before the cutoff.
    """
    if isinstance(text, dict):
        return text
    if not isinstance(text, str):
        text = str(text or "")
    first_brace = text.find("{")
    if first_brace == -1:
        return None
    sub = text[first_brace:]
    pos = len(sub)
    attempts = 0
    while pos > 0 and attempts < 40:
        idx = sub.rfind("}", 0, pos)
        if idx == -1:
            break
        attempts += 1
        for suffix in ("}", "]}", "]}}"):
            candidate = sub[: idx + 1] + suffix
            try:
                parsed = json.loads(candidate, strict=False)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        pos = idx
    return None


def repair_raw_json_string(text: Any) -> str:
    """
    Apply progressive heuristics to fix common LLM JSON syntax issues:
    - Strips markdown fences
    - Strips line/block comments
    - Replaces Python literals (True, False, None)
    - Adds quotes around unquoted object keys (e.g. { title: ... })
    - Removes trailing commas before } or ]
    """
    if isinstance(text, (dict, list)):
        return json.dumps(text, ensure_ascii=False)
    cleaned = str(text or "").strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    else:
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace : last_brace + 1]

    # Remove single-line JS comments
    cleaned = re.sub(r"//.*$", "", cleaned, flags=re.MULTILINE)
    # Replace Python literals
    cleaned = re.sub(r"\bTrue\b", "true", cleaned)
    cleaned = re.sub(r"\bFalse\b", "false", cleaned)
    cleaned = re.sub(r"\bNone\b", "null", cleaned)
    # Quote unquoted property names: { title: ... } or , subtitle: ...
    cleaned = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', cleaned)
    # Remove trailing commas before closing braces or brackets
    cleaned = re.sub(r",\s*([\]\}])", r"\1", cleaned)

    return cleaned


def extract_json_from_text(raw_text: Any) -> Dict[str, Any]:
    """
    Extract and parse a JSON object from LLM output, stripping markdown code fences if present,
    repairing unquoted keys or trailing commas, and salvaging truncated JSON arrays.
    """
    if isinstance(raw_text, dict):
        return raw_text
    cleaned = str(raw_text or "").strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    else:
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace : last_brace + 1]

    # 1. Try direct standard json.loads (strict=False allows literal newlines inside strings)
    try:
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        pass

    # 2. Try progressive heuristic repair (unquoted keys, trailing commas, python literals)
    try:
        repaired = repair_raw_json_string(raw_text or "")
        return json.loads(repaired, strict=False)
    except json.JSONDecodeError:
        pass

    # 3. Try salvaging truncated JSON array
    salvaged = _salvage_truncated_json_array(raw_text or "")
    if salvaged is not None:
        return salvaged

    # 4. Try salvaging after repair
    try:
        repaired = repair_raw_json_string(raw_text or "")
        salvaged_rep = _salvage_truncated_json_array(repaired)
        if salvaged_rep is not None:
            return salvaged_rep
    except Exception:
        pass

    # Re-raise standard JSONDecodeError if completely unrecoverable
    return json.loads(cleaned, strict=False)


LANGUAGE_SYSTEM_INSTRUCTION = (
    "CRITICAL LANGUAGE ENFORCEMENT: All responses, questions, options, summaries, reviewers, and explanations "
    "MUST be written exclusively in English or Tagalog/Filipino. "
    "NEVER generate Spanish (Español), French, or any other language under any circumstance. "
    "Strictly avoid Spanish words (such as 'de', 'la', 'el', 'como', 'para', 'es', 'opción', 'cuenta', 'también', etc.). "
    "If the source material contains non-English/non-Tagalog terms, explain them in English or Tagalog only."
)


def sanitize_language_output(text: Any) -> str:
    """Strip Spanish-specific punctuation (¿, ¡) and enforce clean English/Tagalog formatting."""
    if not text:
        return ""
    if isinstance(text, (dict, list)):
        text = json.dumps(text, ensure_ascii=False)
    elif not isinstance(text, str):
        text = str(text)
    return text.replace("¿", "").replace("¡", "").strip()


async def _generate_with_local_ollama(
    prompt: str,
    system_prompt: Optional[str] = None,
    expect_json: bool = False,
    timeout_seconds: float = 180.0,
) -> str:
    """
    Send a single generation request to local Ollama (127.0.0.1:11434) running gemma3:1b.
    The caller (ai_worker) guarantees concurrency limits globally.
    Enforces English or Tagalog strictly; forbids Spanish.
    """
    combined_system = LANGUAGE_SYSTEM_INSTRUCTION
    if system_prompt:
        combined_system = f"{LANGUAGE_SYSTEM_INSTRUCTION}\n\n{system_prompt}"

    payload: Dict[str, Any] = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "system": combined_system,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.85,
        },
    }
    if expect_json:
        payload["format"] = "json"

    endpoint = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(endpoint, json=payload)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("Failed to connect to local Ollama: %s", exc)
        raise OllamaGenerationError(
            f"Cannot reach local Ollama at {settings.OLLAMA_BASE_URL}. Ensure Ollama is running."
        ) from exc

    if response.status_code != 200:
        detail = response.text[:300]
        raise OllamaGenerationError(
            f"Ollama returned HTTP {response.status_code}: {detail}"
        )

    data = response.json()
    output_text = extract_cf_response(data)
    if not output_text:
        raise OllamaGenerationError("Ollama returned an empty response.")

    return sanitize_language_output(output_text)


async def generate_with_cloudflare(
    prompt: str,
    system_prompt: Optional[str] = None,
    expect_json: bool = False,
    timeout_seconds: float = 120.0,
) -> str:
    """
    Send an inference request to Cloudflare Workers AI running Google Gemma (e.g. @cf/google/gemma-7b-it).
    Enforces English or Tagalog strictly; forbids Spanish.
    """
    account_id = settings.CLOUDFLARE_ACCOUNT_ID
    api_token = settings.CLOUDFLARE_API_TOKEN
    model = settings.CLOUDFLARE_MODEL or "@cf/google/gemma-7b-it"

    if not account_id or not api_token:
        raise OllamaGenerationError(
            "Cloudflare Workers AI is configured as AI provider, but CLOUDFLARE_ACCOUNT_ID "
            "or CLOUDFLARE_API_TOKEN is not set. Please set them in your environment variables."
        )

    combined_system = LANGUAGE_SYSTEM_INSTRUCTION
    if system_prompt:
        combined_system = f"{LANGUAGE_SYSTEM_INSTRUCTION}\n\n{system_prompt}"

    if expect_json:
        combined_system += (
            "\n\nCRITICAL JSON DIRECTIVE: You MUST output strictly a raw, parseable JSON object. "
            "Do NOT wrap in markdown fences (```json). Do NOT add conversational text or markdown before or after."
        )

    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "messages": [
            {"role": "system", "content": combined_system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 4096,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(endpoint, headers=headers, json=payload)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("Failed to connect to Cloudflare Workers AI: %s", exc)
        raise OllamaGenerationError(
            f"Cannot reach Cloudflare Workers AI: {exc}"
        ) from exc

    try:
        data = response.json()
    except Exception:
        raise OllamaGenerationError(
            f"Cloudflare Workers AI returned invalid response format (HTTP {response.status_code}): {response.text[:300]}"
        )

    if response.status_code != 200 or not data.get("success", True):
        errors = data.get("errors", [])
        err_detail = (
            "; ".join(str(e.get("message", e)) if isinstance(e, dict) else str(e) for e in errors)
            if errors
            else response.text[:300]
        )
        raise OllamaGenerationError(
            f"Cloudflare Workers AI error (HTTP {response.status_code}): {err_detail}"
        )

    output_text = extract_cf_response(data)
    if not output_text:
        raise OllamaGenerationError("Cloudflare Workers AI returned an empty response.")

    return sanitize_language_output(output_text)


async def generate_with_ollama(
    prompt: str,
    system_prompt: Optional[str] = None,
    expect_json: bool = False,
    timeout_seconds: float = 180.0,
) -> str:
    """
    Route AI generation to the configured provider (Cloudflare Workers AI Gemma or local Ollama).
    """
    if settings.active_ai_provider == "cloudflare":
        return await generate_with_cloudflare(
            prompt=prompt,
            system_prompt=system_prompt,
            expect_json=expect_json,
            timeout_seconds=timeout_seconds,
        )
    return await _generate_with_local_ollama(
        prompt=prompt,
        system_prompt=system_prompt,
        expect_json=expect_json,
        timeout_seconds=timeout_seconds,
    )


generate_text = generate_with_ollama


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
        "Convert the following academic content into a valid JSON object matching the required schema.\n"
        "IMPORTANT: Preserve the actual academic explanations, facts, and questions from the content below—"
        "do NOT copy placeholder example strings from the schema template.\n\n"
        f"Content to format as JSON:\n{raw_output[:2500]}\n\n"
        f"Required JSON schema structure:\n{schema_hint}\n\n"
        "Return ONLY valid JSON matching the required schema structure and nothing else. "
        "Enclose ALL property names and string values in double quotes. Do not use trailing commas."
    )
    repaired_raw = await generate_with_ollama(
        prompt=repair_prompt,
        system_prompt=(
            f"{LANGUAGE_SYSTEM_INSTRUCTION}\n"
            "You are a strict JSON repair assistant. Output ONLY valid, parseable JSON. "
            "Never output comments or unquoted keys."
        ),
        expect_json=True,
    )
    try:
        repaired_parsed = extract_json_from_text(repaired_raw)
        return schema_model.model_validate(repaired_parsed)
    except (json.JSONDecodeError, ValidationError, ValueError) as second_err:
        logger.warning("Controlled repair failed (%s). Raising OllamaGenerationError.", second_err)
        raise OllamaGenerationError(
            f"Model output did not match required JSON format after 1 repair attempt: {second_err}"
        ) from second_err


async def build_bounded_source_context(
    db: aiosqlite.Connection,
    session_id: str,
    document_id: Optional[str],
    query: str = "",
    max_chunks: int = 12,
    max_chars: int = MAX_PROMPT_SOURCE_CHARS,
) -> tuple[str, List[int], str]:
    """
    Retrieve relevant chunks from SQLite FTS5 for (session_id, document_id) and bound total text length.
    Formats chunks as clean, academic sections without internal confusing tags.
    If document_id is None/empty or deleted, returns empty context immediately.
    """
    clean_doc_id = (document_id or "").strip()
    if not clean_doc_id:
        return "", [], ""

    doc_cur = await db.execute(
        "SELECT original_filename FROM documents WHERE id = ? AND session_id = ?",
        (clean_doc_id, session_id),
    )
    doc_row = await doc_cur.fetchone()
    if not doc_row:
        return "", [], ""

    doc_name = doc_row["original_filename"] if hasattr(doc_row, "keys") else doc_row[0]

    chunks = await retrieve_relevant_chunks(
        db=db,
        session_id=session_id,
        document_id=clean_doc_id,
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
        # Clean section header rather than confusing "Chunk"
        parts.append(f"--- Section {idx_1} ---\n{snippet}")
        chunk_refs.append(idx_1)
        used_chars += len(snippet)

    return "\n\n".join(parts), chunk_refs, doc_name
