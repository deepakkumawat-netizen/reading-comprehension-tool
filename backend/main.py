import os
import sys
import json
import io
import re
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from groq import Groq
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from database import (init_db, create_session, save_comprehension,
                      get_session_history, get_all_comprehensions, save_rag_document)
from rag import rag_retriever
from nlp_adapter import get_grade_prompt_context, analyze_text_grade, GRADE_PROFILES, get_reading_counts
from mcp_tools import MCP_TOOLS, execute_mcp_tool

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_FALLBACK_MODELS = [
    GROQ_MODEL,
    "llama-3.1-8b-instant",
    "deepseek-r1-distill-llama-70b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
]
_groq_client = None


def get_groq_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _groq_client


def is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "rate_limit" in msg or "rate limit" in msg or "tokens per day" in msg


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:
        print(f"[startup] DB init error: {e}")
    try:
        rag_retriever.build_index()
    except Exception as e:
        print(f"[startup] RAG build error: {e}")
    yield


app = FastAPI(title="Reading Comprehension Tool", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ComprehensionRequest(BaseModel):
    topic: str
    grade_level: int
    learning_objective: str
    source_text: Optional[str] = None
    additional_context: Optional[str] = None
    session_id: Optional[str] = None


class SessionCreate(BaseModel):
    metadata: Optional[dict] = None


class MCPToolCall(BaseModel):
    tool_name: str
    arguments: dict


class RAGDocRequest(BaseModel):
    content: str
    topic: Optional[str] = ""
    grade_level: Optional[int] = 0


class CompleteAnswerRequest(BaseModel):
    question: str
    passage_text: str
    grade_level: int
    word_limit: int = 35
    question_type: Optional[str] = "literal"
    answer_hint: Optional[str] = ""


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.post("/api/sessions")
async def new_session(req: SessionCreate):
    session_id = create_session(req.metadata)
    return {"session_id": session_id}


@app.get("/api/sessions/{session_id}/history")
async def session_history(session_id: str):
    return {"session_id": session_id, "history": get_session_history(session_id)}


@app.get("/api/comprehensions")
async def list_comprehensions(limit: int = 20):
    return {"comprehensions": get_all_comprehensions(limit)}


# ── Complete Answer (NLP-calibrated per grade) ────────────────────────────────

@app.post("/api/reading/complete-answer")
async def complete_answer(req: CompleteAnswerRequest):
    p = GRADE_PROFILES.get(req.grade_level, GRADE_PROFILES[7])
    grade_ctx = get_grade_prompt_context(req.grade_level)

    prompt = f"""You are an expert educator writing a model answer for a Grade {req.grade_level} student.

{grade_ctx}

READING PASSAGE:
{req.passage_text[:2000]}

QUESTION TYPE: {req.question_type}
QUESTION: {req.question}

STRICT WORD LIMIT: {req.word_limit} words maximum. Count every word — do NOT exceed this limit.

TASK: Write a model answer in EXACTLY {req.word_limit} words or fewer.
RULES:
1. HARD LIMIT: Your answer must be {req.word_limit} words or fewer. This is non-negotiable.
2. Use ONLY Grade {req.grade_level} vocabulary: {p['vocab']}
3. Sentence structure for Grade {req.grade_level}: {p['sentence']}
4. Cognitive level: {p['blooms']}
5. Reference the passage text as evidence but stay within the word limit.
6. Write ONLY the answer — no "Answer:", no labels, no explanation outside the answer.

Answer ({req.word_limit} words max):"""

    last_error = ""
    for model in GROQ_FALLBACK_MODELS:
        try:
            response = get_groq_client().chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=min(req.word_limit * 3, 300),
            )
            answer = response.choices[0].message.content.strip()
            answer = re.sub(r'^(answer|model answer|response)\s*:\s*', '', answer, flags=re.IGNORECASE).strip()

            # Hard truncate to word limit as safety net
            words = answer.split()
            if len(words) > req.word_limit:
                answer = " ".join(words[:req.word_limit])
                # End at last complete sentence if possible
                for punct in ('.', '!', '?'):
                    last = answer.rfind(punct)
                    if last > len(answer) // 2:
                        answer = answer[:last + 1]
                        break

            return {"answer": answer}
        except Exception as exc:
            last_error = str(exc)
            continue

    raise HTTPException(status_code=503, detail=f"Failed after {len(GROQ_FALLBACK_MODELS)} attempts: {last_error}")


# ── Generate ──────────────────────────────────────────────────────────────────

def _validate_reading(data: dict, grade_level: int = 7) -> "str | None":
    """Return an error description string if the comprehension JSON is invalid, else None.
    Validates structure AND that the passage length roughly matches the grade."""
    byr = data.get("before_you_read")
    if not isinstance(byr, dict) or not isinstance(byr.get("questions"), list) or len(byr["questions"]) < 1:
        return "before_you_read.questions is missing or empty"

    passage = data.get("passage")
    if not isinstance(passage, dict) or not passage.get("text"):
        return "passage.text is missing or empty"

    # Reject passages grossly longer than the grade's range (e.g. Grade 1 getting
    # 263 words). Uses 1.6x the grade max as the ceiling to allow some flexibility.
    try:
        p = GRADE_PROFILES.get(grade_level, GRADE_PROFILES[7])
        rng = p.get("passage_words", "")
        nums = [int(x) for x in re.findall(r"\d+", rng)]
        if nums:
            max_words = max(nums)
            actual = len(passage["text"].split())
            ceiling = int(max_words * 1.6)
            if actual > ceiling:
                return (f"passage is {actual} words but Grade {grade_level} must be "
                        f"{rng} words. Rewrite it MUCH shorter — no more than {max_words} words.")
    except Exception:
        pass

    tdq = data.get("text_dependent_questions")
    if not isinstance(tdq, dict) or not isinstance(tdq.get("questions"), list) or len(tdq["questions"]) < 1:
        return "text_dependent_questions.questions is missing or empty"

    vic = data.get("vocabulary_in_context")
    if not isinstance(vic, dict) or not isinstance(vic.get("items"), list) or len(vic["items"]) < 1:
        return "vocabulary_in_context.items is missing or empty"

    return None


@app.post("/api/reading/generate")
async def generate_comprehension(req: ComprehensionRequest):
    session_id = req.session_id or create_session()

    rag_retriever.build_index()
    rag_context = rag_retriever.build_context(
        f"{req.topic} grade {req.grade_level} {req.learning_objective}",
        grade_level=req.grade_level
    )

    grade_ctx = get_grade_prompt_context(req.grade_level)

    # Pre-compute optional blocks to avoid backslashes inside f-string expressions
    source_block = (
        "\nSOURCE MATERIAL (MANDATORY — base the passage's facts, names, examples and "
        "vocabulary on THIS content only; do not invent facts that contradict it):\n"
        f"---\n{req.source_text[:6000]}\n---\n"
    ) if req.source_text else ""
    additional_block = f"Additional Context: {req.additional_context}" if req.additional_context else ""
    rag_block = f"\n{rag_context}" if rag_context else ""
    ctx_block = f"{source_block}{additional_block}\n{rag_block}".strip()

    def _build_prompt(extra_instructions: str = "") -> str:
        p = GRADE_PROFILES.get(req.grade_level, GRADE_PROFILES[7])
        word_range = p["passage_words"]
        c = get_reading_counts(req.grade_level)

        low_grade_block = f"\n- Passage must be {word_range} words.\n"

        return f"""You are an expert reading specialist and curriculum designer.
Your task is to create a complete, grade-calibrated Reading Comprehension activity.

{grade_ctx}
{low_grade_block}
CONTENT DETAILS:
Topic: {req.topic}
Learning Objective: {req.learning_objective}
{ctx_block}

CRITICAL RULES:
1. Every word you write — passage, questions, instructions, hints — must match Grade {req.grade_level} level EXACTLY.
2. The passage MUST be {word_range} words — count carefully.
3. Generate EXACTLY {c['total_q']} text-dependent questions (calibrated for Grade {req.grade_level} attention) and EXACTLY {c['vocab']} vocabulary items. Do NOT write all literal questions.
4. Vocabulary in Context words must come directly from the passage.
5. Before You Read questions must activate prior knowledge at a Grade {req.grade_level} cognitive level.
{"6. SOURCE MATERIAL is provided above and is the AUTHORITATIVE basis for this passage. The passage MUST be a grade-level rewrite/summary of the SOURCE MATERIAL — every fact, name, number, date, event, term and example must come directly from it. Do NOT invent content from your own knowledge if it contradicts or is absent from the source. Text-dependent questions must reference the rewritten passage (which reflects the source); Vocabulary in Context words must be picked from words actually present in the source." if req.source_text else ""}
{extra_instructions}

Return ONLY valid JSON. No markdown fences. No prose outside the JSON.

{{
  "before_you_read": {{
    "title": "Before You Read",
    "instructions": "Grade {req.grade_level}-appropriate activation prompt here (1 sentence).",
    "questions": [
      {{"number": 1, "question": "Grade {req.grade_level} prior-knowledge question about {req.topic}", "type": "activation"}},
      {{"number": 2, "question": "Grade {req.grade_level} prediction question about the passage", "type": "prediction"}},
      {{"number": 3, "question": "Grade {req.grade_level} inquiry question the student wonders about {req.topic}", "type": "inquiry"}}
    ]
  }},
  "annotation_guide": {{
    "title": "Annotation Guide",
    "instructions": "Grade {req.grade_level}-appropriate reading strategy instruction (1 sentence).",
    "symbols": [
      {{"symbol": "⭐", "meaning": "Grade {req.grade_level} explanation of main idea marking"}},
      {{"symbol": "?", "meaning": "Grade {req.grade_level} explanation of confusion marking"}},
      {{"symbol": "!", "meaning": "Grade {req.grade_level} explanation of interesting info marking"}},
      {{"symbol": "→", "meaning": "Grade {req.grade_level} explanation of cause-effect marking"}},
      {{"symbol": "circle", "meaning": "Grade {req.grade_level} explanation of vocabulary marking"}}
    ]
  }},
  "passage": {{
    "title": "Engaging title relevant to {req.topic}",
    "text": "Write the FULL passage here. Must be {word_range} words. Use paragraph breaks (\\n\\n). Every sentence must match Grade {req.grade_level} syntax and vocabulary.",
    "word_count": "actual number of words in the passage you wrote"
  }},
  "text_dependent_questions": {{
    "title": "Text-Dependent Questions",
    "instructions": "Grade {req.grade_level}-appropriate instruction for answering with text evidence.",
    "questions": [
      {{"number": 1, "question": "Question at Grade {req.grade_level} level", "type": "literal", "answer_hint": "Paragraph evidence"}},
      ... Generate EXACTLY {c['total_q']} questions total for Grade {req.grade_level}:
          {c['literal']} literal (type "literal"), {c['inferential']} inferential (type "inferential"){', ' + str(c['higher']) + ' higher-order Analyze/Evaluate (type "critical_thinking")' if c['higher'] else ''}.
          Number them 1..{c['total_q']}. Each needs an answer_hint pointing to passage evidence.
    ]
  }},
  "vocabulary_in_context": {{
    "title": "Vocabulary in Context",
    "instructions": "Grade {req.grade_level}-appropriate vocabulary strategy instruction.",
    "items": [
      {{
        "word": "actual word from the passage appropriate for Grade {req.grade_level}",
        "sentence_from_passage": "Copy the exact sentence from your passage containing this word.",
        "context_clue_type": "definition|example|contrast|inference",
        "activity": "Grade {req.grade_level}-appropriate activity using this word",
        "answer": "Grade {req.grade_level}-appropriate answer"
      }},
      ... EXACTLY {c['vocab']} items total, each word from the passage
    ]
  }}
}}"""

    def _sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def stream_gen():
        max_attempts = 5
        extra_instructions = ""
        last_reason = ""
        model_idx = 0

        for attempt in range(1, max_attempts + 1):
            if attempt > 1:
                yield _sse({"type": "retry", "attempt": attempt, "reason": last_reason})

            current_model = GROQ_FALLBACK_MODELS[min(model_idx, len(GROQ_FALLBACK_MODELS) - 1)]
            yield _sse({"type": "progress", "message": f"Attempt {attempt}: calling {current_model}…"})

            prompt = _build_prompt(extra_instructions)
            collected_chunks = []

            try:
                stream = get_groq_client().chat.completions.create(
                    model=current_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.75,
                    max_tokens=4500,
                    stream=True,
                )

                for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        collected_chunks.append(delta)
                        yield _sse({"type": "token", "content": delta})

            except Exception as exc:
                last_reason = str(exc)
                if model_idx < len(GROQ_FALLBACK_MODELS) - 1:
                    model_idx += 1
                    next_model = GROQ_FALLBACK_MODELS[model_idx]
                    yield _sse({"type": "status", "message": f"Model error — switching to {next_model}…"})
                    extra_instructions = ""
                else:
                    extra_instructions = f"IMPORTANT: Fix the following error from the previous attempt: {last_reason}\n"
                continue

            raw = "".join(collected_chunks).strip()
            for fence in ("```json", "```"):
                if raw.startswith(fence):
                    raw = raw[len(fence):]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
            # Remove control characters invalid inside JSON strings (keep \t \n \r)
            import re as _re
            raw = _re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', raw)

            yield _sse({"type": "status", "message": "Parsing JSON response…"})

            # Isolate the JSON object (drop any stray prose before/after)
            first, last = raw.find("{"), raw.rfind("}")
            if first != -1 and last != -1 and last > first:
                raw = raw[first:last + 1]

            data = None
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                # LLMs often emit unescaped quotes/apostrophes or trailing commas.
                # json-repair fixes these instead of forcing another full retry.
                try:
                    from json_repair import repair_json
                    repaired = repair_json(raw)
                    data = json.loads(repaired)
                except Exception:
                    last_reason = f"Invalid JSON: {exc}"
                    extra_instructions = (
                        "CRITICAL: Your previous response was not valid JSON. "
                        "Return ONLY a raw JSON object — no markdown fences, no prose. "
                        "Escape every double-quote inside string values as \\\".\n"
                    )
                    continue

            yield _sse({"type": "status", "message": "Validating comprehension structure…"})

            validation_error = _validate_reading(data, req.grade_level)
            if validation_error:
                last_reason = f"Validation failed: {validation_error}"
                extra_instructions = (
                    f"IMPORTANT: Fix this validation error from your previous attempt: {validation_error}. "
                    "Ensure before_you_read has >=3 questions, passage.text is present, "
                    f"passage is {GRADE_PROFILES.get(req.grade_level, GRADE_PROFILES[7])['passage_words']} words, "
                    "text_dependent_questions has >=6 questions, and vocabulary_in_context has >=5 items.\n"
                )
                continue

            # Annotate passage with readability metrics
            passage_text = data.get("passage", {}).get("text", "")
            readability = analyze_text_grade(passage_text)
            if readability:
                data["passage"]["readability"] = readability
                word_count = readability.get("word_count", 0)
                if word_count:
                    data["passage"]["word_count"] = word_count


            yield _sse({"type": "status", "message": "Saving comprehension…"})

            full_content = {**data, "rag_context_used": bool(rag_context)}

            try:
                comp_id = save_comprehension(
                    session_id=session_id,
                    topic=req.topic,
                    grade_level=req.grade_level,
                    learning_objective=req.learning_objective,
                    content=full_content,
                )

                save_rag_document(
                    content=(
                        f"reading comprehension topic {req.topic} grade {req.grade_level} "
                        f"objective {req.learning_objective} passage: {passage_text[:300]}"
                    ),
                    doc_type="comprehension",
                    topic=req.topic,
                    grade_level=req.grade_level,
                )
                rag_retriever.build_index()
            except Exception as exc:
                yield _sse({"type": "error", "message": f"Database error: {exc}"})
                return

            yield _sse({
                "type": "complete",
                "session_id": session_id,
                "comprehension_id": comp_id,
                "comprehension": full_content,
            })
            return

        # Exhausted all retries
        yield _sse({"type": "error", "message": f"Failed after {max_attempts} attempts. Last error: {last_reason}"})

    return StreamingResponse(
        stream_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Export DOCX ───────────────────────────────────────────────────────────────

@app.post("/api/reading/export/docx")
async def export_docx(payload: dict):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    comp = payload.get("comprehension", {})
    topic = payload.get("topic", "Reading")
    grade = payload.get("grade_level", "")
    objective = payload.get("learning_objective", "")

    doc = Document()

    title = doc.add_heading("Reading Comprehension Activity", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph(f"Topic: {topic}  |  Grade: {grade}  |  Objective: {objective}")
    doc.add_paragraph("Name: ____________________________   Date: _______________")
    doc.add_paragraph()

    # Before You Read
    byr = comp.get("before_you_read", {})
    if byr:
        doc.add_heading(byr.get("title", "Before You Read"), 1)
        doc.add_paragraph(byr.get("instructions", ""))
        for q in byr.get("questions", []):
            doc.add_paragraph(f"{q['number']}. {q['question']}")
            doc.add_paragraph("   Answer: ____________________________________________")
        doc.add_paragraph()

    # Annotation Guide
    ag = comp.get("annotation_guide", {})
    if ag:
        doc.add_heading(ag.get("title", "Annotation Guide"), 1)
        doc.add_paragraph(ag.get("instructions", ""))
        for s in ag.get("symbols", []):
            doc.add_paragraph(f"  {s['symbol']} = {s['meaning']}")
        doc.add_paragraph()

    # Passage
    passage = comp.get("passage", {})
    if passage:
        doc.add_heading(passage.get("title", "Reading Passage"), 1)
        for para in passage.get("text", "").split("\n\n"):
            if para.strip():
                doc.add_paragraph(para.strip())
        doc.add_paragraph()

    # Text-Dependent Questions
    tdq = comp.get("text_dependent_questions", {})
    if tdq:
        doc.add_heading(tdq.get("title", "Text-Dependent Questions"), 1)
        doc.add_paragraph(tdq.get("instructions", ""))
        for q in tdq.get("questions", []):
            doc.add_paragraph(f"{q['number']}. {q['question']}")
            doc.add_paragraph("   Answer: ____________________________________________")
            doc.add_paragraph("   ____________________________________________________")
        doc.add_paragraph()

    # Vocabulary in Context
    vic = comp.get("vocabulary_in_context", {})
    if vic:
        doc.add_heading(vic.get("title", "Vocabulary in Context"), 1)
        doc.add_paragraph(vic.get("instructions", ""))
        for i, item in enumerate(vic.get("items", []), 1):
            doc.add_paragraph(f"{i}. Word: \"{item['word']}\"")
            doc.add_paragraph(f"   From the text: \"{item['sentence_from_passage']}\"")
            doc.add_paragraph(f"   {item['activity']}")
            doc.add_paragraph("   My answer: _________________________________________")
            doc.add_paragraph()

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="reading_{topic}.docx"'},
    )


# ── RAG document upload ───────────────────────────────────────────────────────

@app.post("/api/rag/add-text")
async def add_rag_text(req: RAGDocRequest):
    doc_id = save_rag_document(req.content, "knowledge", req.topic, req.grade_level)
    rag_retriever.build_index()
    return {"success": True, "doc_id": doc_id}


@app.post("/api/rag/add-file")
async def add_rag_file(file: UploadFile = File(...)):
    raw = await file.read()
    content = ""
    if file.filename.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(raw))
        content = " ".join(p.extract_text() or "" for p in reader.pages)
    elif file.filename.endswith(".docx"):
        from docx import Document as DocxDoc
        doc = DocxDoc(io.BytesIO(raw))
        content = " ".join(p.text for p in doc.paragraphs)
    else:
        content = raw.decode("utf-8", errors="ignore")

    content = (content or "").strip()
    doc_id = save_rag_document(content[:6000], "file", file.filename, 0)
    rag_retriever.build_index()
    # Return the extracted text so the frontend can pass it as source_text
    # for the generator — otherwise the model ignored uploaded documents.
    return {
        "success": True,
        "doc_id": doc_id,
        "chars_indexed": len(content),
        "text": content[:8000],
        "filename": file.filename,
    }


@app.post("/api/extract-url")
async def extract_url(req: dict):
    """Fetch a webpage and return the cleaned article text as source_text."""
    url = (req.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        import httpx
        from bs4 import BeautifulSoup
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ReadingTool/1.0)"}) as cx:
            r = await cx.get(url)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            for bad in soup(["script", "style", "noscript", "iframe", "nav", "footer", "header", "form", "aside"]):
                bad.decompose()
            title = (soup.title.string or "").strip() if soup.title else ""
            main = soup.find("main") or soup.find("article") or soup.body or soup
            text = re.sub(r"\s+\n", "\n", main.get_text("\n", strip=True))
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            raise HTTPException(status_code=422, detail="Could not extract readable text from this page.")
        return {"success": True, "title": title, "url": url, "text": text[:8000], "chars": len(text)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"URL fetch failed: {e}")


@app.post("/api/extract-youtube")
async def extract_youtube(req: dict):
    """Fetch a YouTube transcript and return it as source_text."""
    url = (req.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})", url)
    if not m:
        raise HTTPException(status_code=400, detail="Could not detect a YouTube video id in that URL.")
    video_id = m.group(1)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        chunks = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join(c.get("text", "") for c in chunks).strip()
        if not text:
            raise HTTPException(status_code=422, detail="Transcript was empty.")
        return {"success": True, "video_id": video_id, "url": url, "text": text[:8000], "chars": len(text)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YouTube transcript fetch failed: {e}")


# ── MCP Tools ─────────────────────────────────────────────────────────────────

@app.get("/mcp/tools")
async def list_mcp_tools():
    return {"tools": MCP_TOOLS}


@app.post("/mcp/tools/call")
async def call_mcp_tool(req: MCPToolCall):
    try:
        result = await execute_mcp_tool(req.tool_name, req.arguments)
        return {"success": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "tool": "reading-comprehension", "model": GROQ_MODEL}


# ── Serve frontend ────────────────────────────────────────────────────────────

frontend_dir = Path(__file__).parent.parent / "frontend" / "dist"

if frontend_dir.exists():
    from fastapi.responses import FileResponse

    @app.get("/")
    async def serve_index():
        return FileResponse(
            str(frontend_dir / "index.html"),
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    @app.get("/assets/index.js")
    async def serve_js():
        return FileResponse(
            str(frontend_dir / "assets" / "index.js"),
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )

    try:
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="static")
    except Exception as e:
        print(f"[startup] Static files mount skipped: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003, reload=True)
