import os
import sys
import json
import io
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
from nlp_adapter import get_grade_prompt_context, analyze_text_grade
from mcp_tools import MCP_TOOLS, execute_mcp_tool

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_groq_client = None


def get_groq_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _groq_client


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


# ── Generate ──────────────────────────────────────────────────────────────────

def _validate_reading(data: dict) -> "str | None":
    """Return an error description string if the comprehension JSON is invalid, else None."""
    byr = data.get("before_you_read")
    if not isinstance(byr, dict) or not isinstance(byr.get("questions"), list) or len(byr["questions"]) < 3:
        count = len(byr["questions"]) if isinstance(byr, dict) and isinstance(byr.get("questions"), list) else "missing"
        return f"before_you_read.questions must have at least 3 items, got {count}"

    passage = data.get("passage")
    if not isinstance(passage, dict) or not passage.get("text"):
        return "passage.text is missing or empty"

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
        return f"""You are an expert reading specialist creating a Reading Comprehension activity.

{grade_ctx}
Topic: {req.topic}
Learning Objective: {req.learning_objective}
{ctx_block}
{extra_instructions}
Generate a complete reading comprehension activity. Return ONLY valid JSON with this exact structure:
{{
  "before_you_read": {{
    "title": "Before You Read",
    "instructions": "Think about what you already know. Answer these questions before reading.",
    "questions": [
      {{"number": 1, "question": "What do you already know about {req.topic}?", "type": "activation"}},
      {{"number": 2, "question": "What do you predict this passage will be about?", "type": "prediction"}},
      {{"number": 3, "question": "What questions do you have about {req.topic}?", "type": "inquiry"}}
    ]
  }},
  "annotation_guide": {{
    "title": "Annotation Guide",
    "instructions": "As you read, use these symbols to mark the text:",
    "symbols": [
      {{"symbol": "⭐", "meaning": "Important fact or main idea"}},
      {{"symbol": "?", "meaning": "Something you don't understand"}},
      {{"symbol": "!", "meaning": "Surprising or interesting information"}},
      {{"symbol": "→", "meaning": "Cause and effect relationship"}},
      {{"symbol": "circle", "meaning": "Vocabulary word to look up"}}
    ]
  }},
  "passage": {{
    "title": "Title of the Passage",
    "text": "Full reading passage here — write a complete, engaging, grade-appropriate passage of the target word count. Include paragraph breaks using \\n\\n.",
    "word_count": 300
  }},
  "text_dependent_questions": {{
    "title": "Text-Dependent Questions",
    "instructions": "Use evidence from the passage to answer each question.",
    "questions": [
      {{"number": 1, "question": "According to the passage, what is...?", "type": "literal", "answer_hint": "Found in paragraph 1"}},
      {{"number": 2, "question": "What does the author mean when...?", "type": "literal", "answer_hint": "Found in paragraph 2"}},
      {{"number": 3, "question": "Why did... happen?", "type": "literal", "answer_hint": "Found in paragraph 2-3"}},
      {{"number": 4, "question": "What can you infer about...?", "type": "inferential", "answer_hint": "Use clues from paragraph 3"}},
      {{"number": 5, "question": "How does... relate to...?", "type": "inferential", "answer_hint": "Connect ideas across paragraphs"}},
      {{"number": 6, "question": "What is the main idea of this passage?", "type": "main_idea", "answer_hint": "Consider all paragraphs"}}
    ]
  }},
  "vocabulary_in_context": {{
    "title": "Vocabulary in Context",
    "instructions": "Use clues from the passage to figure out the meaning of each word.",
    "items": [
      {{
        "word": "word_from_passage",
        "sentence_from_passage": "The exact sentence containing the word...",
        "context_clue_type": "definition",
        "activity": "What does 'word' mean in this sentence? What clues helped you?",
        "answer": "It means..."
      }},
      ... 5 items total
    ]
  }}
}}"""

    def _sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def stream_gen():
        max_attempts = 3
        extra_instructions = ""
        last_reason = ""

        for attempt in range(1, max_attempts + 1):
            if attempt > 1:
                yield _sse({"type": "retry", "attempt": attempt, "reason": last_reason})

            yield _sse({"type": "progress", "message": f"Attempt {attempt}: calling Groq model…"})

            prompt = _build_prompt(extra_instructions)
            collected_chunks = []

            try:
                stream = get_groq_client().chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.75,
                    max_tokens=4000,
                    stream=True,
                )

                for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        collected_chunks.append(delta)
                        yield _sse({"type": "token", "content": delta})

            except Exception as exc:
                last_reason = str(exc)
                extra_instructions = f"IMPORTANT: Fix the following error from the previous attempt: {last_reason}\n"
                continue

            raw = "".join(collected_chunks).strip()
            for fence in ("```json", "```"):
                if raw.startswith(fence):
                    raw = raw[len(fence):]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

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

            validation_error = _validate_reading(data)
            if validation_error:
                last_reason = f"Validation failed: {validation_error}"
                extra_instructions = (
                    f"IMPORTANT: Fix this validation error from your previous attempt: {validation_error}. "
                    "Ensure before_you_read has >=3 questions, passage.text is present, "
                    "text_dependent_questions has >=6 questions, and vocabulary_in_context has >=5 items.\n"
                )
                continue

            yield _sse({"type": "status", "message": "Checking passage readability…"})

            passage_text = data.get("passage", {}).get("text", "")
            readability = analyze_text_grade(passage_text)
            fk_grade = readability.get("flesch_kincaid_grade", req.grade_level) if readability else req.grade_level

            if abs(fk_grade - req.grade_level) > 6:
                last_reason = (
                    f"Passage readability FK grade {fk_grade:.1f} is more than 6 levels away "
                    f"from target grade {req.grade_level}"
                )
                extra_instructions = (
                    f"IMPORTANT: Your passage had a Flesch-Kincaid grade of {fk_grade:.1f} "
                    f"but the target is grade {req.grade_level}. "
                    "Rewrite the passage so FK grade is within 6 of the target.\n"
                )
                continue

            # Annotate passage with readability metrics
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

    try:
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="static")
    except Exception as e:
        print(f"[startup] Static files mount skipped: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003, reload=True)
