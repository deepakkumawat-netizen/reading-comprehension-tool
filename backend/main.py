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
from nlp_adapter import get_grade_prompt_context, analyze_text_grade, GRADE_PROFILES
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
    """Return an error description string if the comprehension JSON is invalid, else None."""
    byr = data.get("before_you_read")
    if not isinstance(byr, dict) or not isinstance(byr.get("questions"), list) or len(byr["questions"]) < 3:
        count = len(byr["questions"]) if isinstance(byr, dict) and isinstance(byr.get("questions"), list) else "missing"
        return f"before_you_read.questions must have at least 3 items, got {count}"

    passage = data.get("passage")
    if not isinstance(passage, dict) or not passage.get("text"):
        return "passage.text is missing or empty"

    passage_text = passage["text"]
    p = GRADE_PROFILES.get(grade_level, GRADE_PROFILES[7])

    # Word count range validation
    word_range = p.get("passage_words", "150-400")
    min_w, max_w = map(int, word_range.split("-"))
    actual_w = len(passage_text.split())
    if actual_w > max_w * 1.25:
        return (
            f"Passage too long: {actual_w} words. Grade {grade_level} requires {word_range} words. "
            f"Shorten it significantly."
        )


    # FK readability gate for grades 1–6 (3 grade-level tolerance)
    if grade_level <= 6:
        readability = analyze_text_grade(passage_text)
        if readability:
            fk = readability.get("flesch_kincaid_grade", 0)
            fk_max = float(p.get("fk_target", "0-12").split("-")[1]) + 3.0
            if fk > fk_max:
                return (
                    f"Passage readability FK grade {fk:.1f} is too high for Grade {grade_level} "
                    f"(target: {p['fk_target']}). Use much simpler vocabulary and shorter sentences."
                )

    tdq = data.get("text_dependent_questions")
    if not isinstance(tdq, dict) or not isinstance(tdq.get("questions"), list) or len(tdq["questions"]) < 6:
        count = len(tdq["questions"]) if isinstance(tdq, dict) and isinstance(tdq.get("questions"), list) else "missing"
        return f"text_dependent_questions.questions must have at least 6 items, got {count}"

    vic = data.get("vocabulary_in_context")
    if not isinstance(vic, dict) or not isinstance(vic.get("items"), list) or len(vic["items"]) < 5:
        count = len(vic["items"]) if isinstance(vic, dict) and isinstance(vic.get("items"), list) else "missing"
        return f"vocabulary_in_context.items must have at least 5 items, got {count}"

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
    source_block = f"\nBase the passage on this source material:\n{req.source_text[:2000]}\n" if req.source_text else ""
    additional_block = f"Additional Context: {req.additional_context}" if req.additional_context else ""
    rag_block = f"\n{rag_context}" if rag_context else ""
    ctx_block = f"{source_block}{additional_block}\n{rag_block}".strip()

    def _build_prompt(extra_instructions: str = "") -> str:
        p = GRADE_PROFILES.get(req.grade_level, GRADE_PROFILES[7])
        word_range = p["passage_words"]

        # Build strict low-grade vocabulary block
        if req.grade_level <= 4:
            max_syl = 2 if req.grade_level <= 3 else 3
            low_grade_block = f"""
⚠️ GRADE {req.grade_level} MANDATORY VOCABULARY RULES — VIOLATION = RETRY:
- Passage MUST be {word_range} words total. Count before submitting.
- Every word must be understood by a {req.grade_level + 5}-year-old child.
- Maximum {max_syl} syllables per word in the entire passage.
- FORBIDDEN in passage: long scientific/academic terms. Instead use simple substitutes:
    "precipitation" → "rain"   "continental" → "land"   "atmosphere" → "air"
    "environment" → "place"    "geographical" → "where"  "equatorial" → "hot and near the middle"
    "temperature" → "how hot"  "humidity" → "wetness"   "vegetation" → "plants"
- Each sentence: {p['sentence']}
- Flesch-Kincaid Grade target: {p['fk_target']} (SHORT sentences + SIMPLE words)
"""
        else:
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
3. Questions must match the Bloom's level specified above. Do NOT write all literal questions.
4. Vocabulary in Context words must come directly from the passage.
5. Before You Read questions must activate prior knowledge at a Grade {req.grade_level} cognitive level.
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
    "text": "Write the FULL passage here. Must be {GRADE_PROFILES.get(req.grade_level, GRADE_PROFILES[7])['passage_words']} words. Use paragraph breaks (\\n\\n). Every sentence must match Grade {req.grade_level} syntax and vocabulary.",
    "word_count": 300
  }},
  "text_dependent_questions": {{
    "title": "Text-Dependent Questions",
    "instructions": "Grade {req.grade_level}-appropriate instruction for answering with text evidence.",
    "questions": [
      {{"number": 1, "question": "Literal question at Grade {req.grade_level} level", "type": "literal", "answer_hint": "Paragraph 1 evidence"}},
      {{"number": 2, "question": "Literal question at Grade {req.grade_level} level", "type": "literal", "answer_hint": "Paragraph 2 evidence"}},
      {{"number": 3, "question": "Literal question at Grade {req.grade_level} level", "type": "literal", "answer_hint": "Paragraph 2-3 evidence"}},
      {{"number": 4, "question": "Inferential question at Grade {req.grade_level} Bloom's level", "type": "inferential", "answer_hint": "Infer from paragraphs 2-3"}},
      {{"number": 5, "question": "Inferential question at Grade {req.grade_level} Bloom's level", "type": "inferential", "answer_hint": "Connect across paragraphs"}},
      {{"number": 6, "question": "Higher-order question at Grade {req.grade_level} Bloom's level (Analyze/Evaluate)", "type": "critical_thinking", "answer_hint": "Use whole passage + reasoning"}},
      {{"number": 7, "question": "Main idea question phrased at Grade {req.grade_level} level", "type": "main_idea", "answer_hint": "Synthesize all paragraphs"}}
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
      ... 5 items total, each word from the passage
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

            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                last_reason = f"Invalid JSON: {exc}"
                extra_instructions = (
                    "CRITICAL: Your previous response was not valid JSON. "
                    "Return ONLY a raw JSON object — no markdown fences, no prose.\n"
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

            # Annotate passage with readability metrics (informational only, not a gate)
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

    doc_id = save_rag_document(content[:6000], "file", file.filename, 0)
    rag_retriever.build_index()
    return {"success": True, "doc_id": doc_id, "chars_indexed": len(content)}


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
