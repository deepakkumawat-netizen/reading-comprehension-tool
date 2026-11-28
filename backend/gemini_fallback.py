"""Gemini rotation fallback for the Groq-primary tools.

Used when every Groq model in the chain has failed (rate limit, dead model
id, or a transient 5xx). Plain REST over stdlib urllib so there is no extra
dependency to keep in sync with the google-genai SDK.

Env:
  GEMINI_API_KEY     required, else this module reports not-configured
  GEMINI_MODEL       default gemini-flash-lite-latest
  GEMINI_MODEL_ALT   default gemini-3-flash-preview

Note: gemini-2.5-flash / gemini-2.5-flash-lite are NOT usable on newer API
keys ("no longer available to new users"), and gemini-1.5-pro /
gemini-2.0-flash are fully decommissioned. Do not reintroduce them.
"""
import json
import os
import urllib.error
import urllib.request

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

MODELS = [m for m in (
    os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest"),
    os.getenv("GEMINI_MODEL_ALT", "gemini-3-flash-preview"),
) if m]


def is_configured() -> bool:
    return bool(API_KEY)


def _retryable(msg: str) -> bool:
    m = msg.lower()
    return any(s in m for s in (
        "429", "quota", "resource_exhausted", "rate limit",
        "500", "502", "503", "504", "overloaded", "high demand",
        "unavailable", "timeout", "timed out",
        "404", "no longer available", "not available to new users",
    ))


def _call(model: str, messages, temperature=None, max_tokens=None, timeout=90) -> str:
    system_parts, contents = [], []
    for m in messages:
        role = m.get("role", "user")
        text = m.get("content", "")
        if not isinstance(text, str):
            continue
        if role == "system":
            system_parts.append(text)
            continue
        contents.append({
            "role": "model" if role == "assistant" else "user",
            "parts": [{"text": text}],
        })
    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

    body = {"contents": contents, "generationConfig": {}}
    if system_parts:
        body["system_instruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}
    if temperature is not None:
        body["generationConfig"]["temperature"] = temperature
    if max_tokens:
        body["generationConfig"]["maxOutputTokens"] = max_tokens

    req = urllib.request.Request(
        f"{BASE_URL}/{model}:generateContent",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": API_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"Gemini {model} HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}"
        ) from e

    cands = payload.get("candidates") or []
    if not cands:
        raise RuntimeError(f"Gemini {model} returned no candidates")
    return "".join(
        p.get("text", "") for p in cands[0].get("content", {}).get("parts", [])
    )


def complete(messages, temperature=None, max_tokens=None, timeout=90) -> str:
    """Rotate through the Gemini models; return the first successful text.

    `messages` is an OpenAI-style list of {"role", "content"} dicts.
    Raises the last error if every model fails.
    """
    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    last = None
    for model in MODELS:
        try:
            return _call(model, messages, temperature, max_tokens, timeout)
        except Exception as e:
            last = e
            if not _retryable(str(e)):
                raise
            print(f"[gemini_fallback] {model} failed — rotating: {str(e)[:120]}")
    raise last if last else RuntimeError("No Gemini model available")
