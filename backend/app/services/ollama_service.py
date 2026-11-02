import json
import logging
import re
from typing import Any, Dict, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


class OllamaGenerationError(Exception):
    """Raised when local Ollama fails or returns an invalid response."""


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
            "temperature": 0.3,
            "num_predict": 1024,
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
