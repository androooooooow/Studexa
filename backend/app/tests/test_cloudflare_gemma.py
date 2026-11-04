import asyncio
import json
import httpx
import pytest
from pydantic import BaseModel
from app.config import settings
from app.services import ollama_service
from app.schemas.study_tools import TutorLLMOutput
from app.services.ollama_service import (
    AIGenerationError,
    OllamaGenerationError,
    extract_cf_response,
    generate_and_validate_json,
    generate_with_cloudflare,
    generate_with_ollama,
)


class SampleStudySchema(BaseModel):
    title: str
    key_points: list[str]


def test_cloudflare_generation_success(monkeypatch):
    """Verify successful inference using Cloudflare Workers AI with Gemma."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "cloudflare")
    monkeypatch.setattr(settings, "CLOUDFLARE_ACCOUNT_ID", "cf_acc_12345")
    monkeypatch.setattr(settings, "CLOUDFLARE_API_TOKEN", "cf_tok_secret999")
    monkeypatch.setattr(settings, "CLOUDFLARE_MODEL", "@cf/google/gemma-7b-it")

    captured_url = None
    captured_headers = None
    captured_payload = None

    class MockResponse:
        status_code = 200

        def json(self):
            return {
                "result": {"response": "This is a study note on Operating Systems."},
                "success": True,
                "errors": [],
                "messages": [],
            }

    async def mock_post(self, url, headers=None, json=None, **kwargs):
        nonlocal captured_url, captured_headers, captured_payload
        captured_url = url
        captured_headers = headers
        captured_payload = json
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(generate_with_ollama("Explain CPU scheduling"))
    assert result == "This is a study note on Operating Systems."
    assert captured_url == "https://api.cloudflare.com/client/v4/accounts/cf_acc_12345/ai/run/@cf/google/gemma-7b-it"
    assert captured_headers["Authorization"] == "Bearer cf_tok_secret999"
    assert captured_payload["messages"][1]["content"] == "Explain CPU scheduling"


def test_cloudflare_missing_credentials(monkeypatch):
    """Verify that missing credentials raise descriptive error."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "cloudflare")
    monkeypatch.setattr(settings, "CLOUDFLARE_ACCOUNT_ID", "")
    monkeypatch.setattr(settings, "CLOUDFLARE_API_TOKEN", "")

    with pytest.raises(OllamaGenerationError) as exc_info:
        asyncio.run(generate_with_cloudflare("test prompt"))
    assert "CLOUDFLARE_ACCOUNT_ID" in str(exc_info.value)


def test_cloudflare_api_error_response(monkeypatch):
    """Verify that Cloudflare error payload is surfaced properly."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "cloudflare")
    monkeypatch.setattr(settings, "CLOUDFLARE_ACCOUNT_ID", "acc_123")
    monkeypatch.setattr(settings, "CLOUDFLARE_API_TOKEN", "tok_123")

    class ErrorResponse:
        status_code = 400

        def json(self):
            return {
                "success": False,
                "errors": [{"code": 1000, "message": "Invalid model identifier"}],
            }

    async def mock_err_post(self, url, headers=None, json=None, **kwargs):
        return ErrorResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_err_post)

    with pytest.raises(OllamaGenerationError) as exc_info:
        asyncio.run(generate_with_cloudflare("test prompt"))
    assert "Invalid model identifier" in str(exc_info.value)


def test_cloudflare_json_structured_generation(monkeypatch):
    """Verify structured JSON generation with schema validation via Cloudflare Gemma."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "cloudflare")
    monkeypatch.setattr(settings, "CLOUDFLARE_ACCOUNT_ID", "acc_123")
    monkeypatch.setattr(settings, "CLOUDFLARE_API_TOKEN", "tok_123")

    expected_data = {
        "title": "Data Structures",
        "key_points": ["Binary Trees", "Hash Tables", "Linked Lists"],
    }

    class MockJsonResponse:
        status_code = 200

        def json(self):
            return {
                "result": {"response": json.dumps(expected_data)},
                "success": True,
            }

    async def mock_json_post(self, url, headers=None, json=None, **kwargs):
        return MockJsonResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_json_post)

    parsed = asyncio.run(
        generate_and_validate_json(
            prompt="List key data structures",
            system_prompt="Study Assistant",
            schema_model=SampleStudySchema,
            schema_hint='{"title": "...", "key_points": ["..."]}',
        )
    )

    assert parsed.title == "Data Structures"
    assert len(parsed.key_points) == 3


def test_extract_cf_response_handles_dict_and_string_variants(monkeypatch):
    """Verify extract_cf_response and generate_and_validate_json handle dict responses without .strip() AttributeError."""
    # 1. Standard nested dict with string response
    assert extract_cf_response({"result": {"response": "  Hello World  "}, "success": True}) == "Hello World"
    # 2. Direct string inside result
    assert extract_cf_response({"result": "  Direct text  ", "success": True}) == "Direct text"
    # 3. Auto-parsed JSON dict inside result.response (Cloudflare Workers AI JSON behavior)
    nested_dict_payload = {
        "result": {
            "response": {
                "answer": "Accrual accounting recognizes revenue when earned.",
                "is_accountancy_related": True,
                "source_grounded": False,
                "knowledge_label": "General Accountancy Study Knowledge",
                "cited_chunks": [],
            }
        },
        "success": True,
    }
    extracted = extract_cf_response(nested_dict_payload)
    assert isinstance(extracted, str)

    monkeypatch.setattr(settings, "AI_PROVIDER", "cloudflare")
    monkeypatch.setattr(settings, "CLOUDFLARE_ACCOUNT_ID", "acc_123")
    monkeypatch.setattr(settings, "CLOUDFLARE_API_TOKEN", "tok_123")

    class MockDictJsonResponse:
        status_code = 200

        def json(self):
            return nested_dict_payload

    async def mock_dict_post(self, url, headers=None, json=None, **kwargs):
        return MockDictJsonResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_dict_post)

    tutor_out = asyncio.run(
        generate_and_validate_json(
            prompt="Explain accrual accounting",
            system_prompt="Study Tutor",
            schema_model=TutorLLMOutput,
            schema_hint='{"answer": "..."}',
        )
    )
    assert tutor_out.answer == "Accrual accounting recognizes revenue when earned."
    assert tutor_out.is_accountancy_related is True
    assert tutor_out.source_grounded is False
