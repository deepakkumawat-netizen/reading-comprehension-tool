"""Multi-provider LLM client with auto-fallback.

Single entry point: `chat_with_fallback(messages, **kwargs)`. Walks a chain
of providers and returns the first successful response in an OpenAI-shaped
object (`resp.choices[0].message.content`). The chain is:

  1. Claude Haiku 4.5              (preferred — paid, prompt-cached, fastest)
  2. Groq llama-3.3-70b-versatile  (free tier — best quality among the 3)
  3. Groq llama-3.1-8b-instant     (smaller Groq model — separate daily quota)
  4. Groq gemma2-9b-it             (separate daily quota again)
  5. Gemini Flash (latest)         (paid, cheapest — final safety net)

Why this order: Claude first when credits are available (prompt caching
makes repeat lessons very cheap), Groq's free-tier per-model quotas next
(each model has its own 100K-tokens/day budget), then Gemini as the final
paid safety net so the tool never goes completely dark.

Callers do not need to know which provider answered — the response shape
is identical (`resp.choices[0].message.content`).
"""

import os
from openai import OpenAI

_GROQ_KEY   = (os.getenv("GROQ_API_KEY")      or "").strip()
_ANTHRO_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
_GEMINI_KEY = (os.getenv("GEMINI_API_KEY")    or "").strip()

GROQ_PRIMARY = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_FALLBACK_MODELS = [GROQ_PRIMARY, "llama-3.1-8b-instant", "gemma2-9b-it"]

CLAUDE_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")

_groq = OpenAI(api_key=_GROQ_KEY or "missing", base_url="https://api.groq.com/openai/v1") if _GROQ_KEY else None

_anthropic = None
if _ANTHRO_KEY:
    try:
        import anthropic
        _anthropic = anthropic.Anthropic(api_key=_ANTHRO_KEY)
    except ImportError:
        _anthropic = None

# Official Google GenAI SDK (replaces raw-requests path used during the
# initial spike). Same SDK that unlocks multimodal / function-calling /
# Files API / streaming when we want them later.
_gemini = None
if _GEMINI_KEY:
    try:
        from google import genai as _genai
        _gemini = _genai.Client(api_key=_GEMINI_KEY)
    except ImportError:
        _gemini = None
_gemini_ready = _gemini is not None


def _is_rate_limit(err: Exception) -> bool:
    msg = str(err).lower()
    return any(s in msg for s in (
        "rate_limit", "429", "tokens per day", "tpd", "quota", "rate limit",
    ))


# Track Claude state per-process so a permanent error (credit exhausted,
# invalid key, etc.) doesn't cause every single request to retry it and
# pay ~500ms of round-trip latency before falling through to Groq.
_claude_disabled_reason = None
_gemini_disabled_reason = None


def _is_claude_permanent_failure(err: Exception) -> bool:
    """Errors that won't resolve by retrying — disable Claude until the
    process restarts (next deploy)."""
    msg = str(err).lower()
    return any(s in msg for s in (
        "credit balance is too low",
        "invalid x-api-key",
        "authentication_error",
        "permission_error",
    ))


def _is_gemini_permanent_failure(err: Exception) -> bool:
    """Errors that won't resolve by retrying for Gemini — bad key, no
    billing, perm denied. Don't waste latency retrying these."""
    msg = str(err).lower()
    return any(s in msg for s in (
        "api key not valid",
        "permission_denied",
        "invalid_argument",
        "api_key_invalid",
        "billing",
        "consumer_invalid",
    ))


class _Msg:
    __slots__ = ("content", "role")
    def __init__(self, content: str, role: str = "assistant"):
        self.content = content
        self.role = role


class _Choice:
    __slots__ = ("message", "index", "finish_reason")
    def __init__(self, content: str):
        self.message = _Msg(content)
        self.index = 0
        self.finish_reason = "stop"


class _ClaudeResponse:
    """OpenAI-shaped wrapper around an Anthropic response."""
    def __init__(self, content: str, model: str):
        self.choices = [_Choice(content)]
        self.model = model


class _GeminiResponse:
    """OpenAI-shaped wrapper around a Gemini response."""
    def __init__(self, content: str, model: str):
        self.choices = [_Choice(content)]
        self.model = model


def _call_gemini(messages, **kwargs):
    """Call Gemini via the official google-genai SDK.

    Converts OpenAI-style messages (system / user / assistant) to Gemini's
    contents + system_instruction format. Roles in Gemini: 'user' and
    'model' (assistant becomes model). Returns an OpenAI-shaped object
    so callers don't need to know Gemini answered.

    Using the SDK (not raw HTTP) so future upgrades — multimodal images,
    Files API for NCERT PDFs, function calling, search grounding —
    require minimal code change."""
    if not _gemini_ready:
        raise RuntimeError("Gemini not configured — set GEMINI_API_KEY or install `google-genai`")

    from google.genai import types as _gtypes

    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    contents = []
    for m in messages:
        role = m.get("role", "user")
        if role == "system":
            continue
        if role == "assistant":
            role = "model"
        if role not in ("user", "model"):
            role = "user"
        contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})

    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

    cfg_args = {}
    if system_parts:
        cfg_args["system_instruction"] = "\n\n".join(system_parts)
    if "temperature" in kwargs:
        cfg_args["temperature"] = kwargs["temperature"]
    if "max_tokens" in kwargs or "max_completion_tokens" in kwargs:
        cfg_args["max_output_tokens"] = kwargs.get("max_tokens") or kwargs.get("max_completion_tokens") or 2048

    config = _gtypes.GenerateContentConfig(**cfg_args) if cfg_args else None

    resp = _gemini.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    )
    text = resp.text or ""
    return _GeminiResponse(text, GEMINI_MODEL)


def _call_claude(messages, **kwargs):
    if _anthropic is None:
        raise RuntimeError("Anthropic SDK not configured — set ANTHROPIC_API_KEY and install `anthropic`")

    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    chat_msgs = []
    for m in messages:
        if m.get("role") == "system":
            continue
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        chat_msgs.append({"role": role, "content": m.get("content", "")})

    if not chat_msgs:
        chat_msgs = [{"role": "user", "content": "Hello"}]

    params = {
        "model": CLAUDE_MODEL,
        "max_tokens": kwargs.get("max_tokens") or kwargs.get("max_completion_tokens") or 2048,
        "messages": chat_msgs,
    }
    if system_parts:
        # Anthropic prompt caching: when the system prompt is large and
        # repeats (CBSE chapter grounding + language directive + grade-style
        # block + format spec on every explain_topic call), wrap it in the
        # structured array form with cache_control. Reads from cache cost
        # ~10% of input tokens and are ~30-50% faster. The minimum cached
        # block size is 1024 tokens for sonnet/opus and 2048 for haiku; our
        # combined system prompt for a CBSE lesson easily clears that.
        # Cache survives 5 minutes between requests (ephemeral TTL) — long
        # enough that consecutive student requests in a session hit it.
        params["system"] = [
            {
                "type": "text",
                "text": "\n\n".join(system_parts),
                "cache_control": {"type": "ephemeral"},
            }
        ]
    if "temperature" in kwargs:
        params["temperature"] = kwargs["temperature"]

    resp = _anthropic.messages.create(**params)
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return _ClaudeResponse(text, CLAUDE_MODEL)


def chat_with_fallback(messages, prefer_anthropic: bool = True, prefer_gemini: bool = False, **kwargs):
    """Run a chat completion, falling back across providers on rate-limit errors.

    Strips any model kwarg the caller passed — this helper chooses the model.
    Non-rate-limit errors propagate immediately so real bugs surface.

    Provider selection:
      prefer_gemini=True  → Gemini → Groq → Claude
          For CBSE/NCERT-aligned lessons. Empirically Gemini Flash has
          substantial NCERT content memorized (correct chapter titles,
          authors, and plot details for popular chapters — verified on
          Class 5 Hindi 'चतुर चित्रकार', Class 8 History 'How, When and
          Where', etc.). When the caller knows the topic is a CBSE
          chapter, use this flag to prioritize accuracy.

      prefer_anthropic=True (default) → Claude → Groq → Gemini
          For generic / custom / non-CBSE topics where Claude's quality +
          prompt-cached repeat calls win.

      Both False → Groq → Claude → Gemini (free-tier first)

    prefer_gemini takes precedence over prefer_anthropic if both are True.
    """
    kwargs.pop("model", None)
    global _claude_disabled_reason, _gemini_disabled_reason

    last_err = None
    claude_ready = _anthropic is not None and _claude_disabled_reason is None
    gemini_ready = _gemini_ready and _gemini_disabled_reason is None

    # ── Tier 1: Gemini-first path for CBSE/NCERT content ─────────────────
    if prefer_gemini and gemini_ready:
        try:
            return _call_gemini(messages, **kwargs)
        except Exception as e:
            last_err = e
            if _is_gemini_permanent_failure(e):
                _gemini_disabled_reason = str(e).splitlines()[0][:200]
                print(f"[llm] Gemini disabled for this process — {_gemini_disabled_reason}. Future requests skip Gemini.")
            else:
                print(f"[llm] Gemini (preferred for CBSE) failed: {e} — falling through to Groq")

    # ── Tier 2: Claude-first path for generic content ────────────────────
    if not prefer_gemini and prefer_anthropic and claude_ready:
        try:
            return _call_claude(messages, **kwargs)
        except Exception as e:
            last_err = e
            if _is_claude_permanent_failure(e):
                _claude_disabled_reason = str(e).splitlines()[0][:200]
                print(f"[llm] Claude disabled for this process — {_claude_disabled_reason}. Future requests skip Claude.")
            else:
                print(f"[llm] Claude (preferred) failed: {e} — falling through to Groq")

    # ── Tier 3: Groq (free tier) — common middle fallback ────────────────
    if _groq is not None:
        for model in GROQ_FALLBACK_MODELS:
            try:
                return _groq.chat.completions.create(model=model, messages=messages, **kwargs)
            except Exception as e:
                if not _is_rate_limit(e):
                    raise
                last_err = e
                print(f"[llm] Groq {model} rate-limited, trying next…")

    # ── Tier 4: Whichever paid provider wasn't tried first ───────────────
    # If prefer_gemini was on, try Claude here. If prefer_anthropic was on
    # (or neither), try Gemini here. Either way the request gets a final
    # paid safety-net before raising.
    if prefer_gemini and claude_ready:
        try:
            print(f"[llm] All Groq models exhausted — falling back to Claude {CLAUDE_MODEL}")
            return _call_claude(messages, **kwargs)
        except Exception as e:
            last_err = e
            if _is_claude_permanent_failure(e):
                _claude_disabled_reason = str(e).splitlines()[0][:200]
                print(f"[llm] Claude disabled for this process — {_claude_disabled_reason}")
            else:
                print(f"[llm] Claude fallback failed: {e}")
    elif gemini_ready:
        try:
            print(f"[llm] All other providers exhausted — falling back to Gemini {GEMINI_MODEL}")
            return _call_gemini(messages, **kwargs)
        except Exception as e:
            last_err = e
            if _is_gemini_permanent_failure(e):
                _gemini_disabled_reason = str(e).splitlines()[0][:200]
                print(f"[llm] Gemini disabled for this process — {_gemini_disabled_reason}. Future requests skip Gemini.")
            else:
                print(f"[llm] Gemini fallback failed: {e}")

    if last_err is not None:
        raise last_err
    raise RuntimeError("No LLM provider configured — set GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY")
