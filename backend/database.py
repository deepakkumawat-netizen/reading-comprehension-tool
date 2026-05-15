import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "reading_tool.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            created_at TEXT,
            metadata TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS comprehensions (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            topic TEXT,
            grade_level INTEGER,
            learning_objective TEXT,
            content TEXT,
            created_at TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS rag_documents (
            id TEXT PRIMARY KEY,
            content TEXT,
            doc_type TEXT,
            topic TEXT,
            grade_level INTEGER,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def create_session(metadata: dict = None) -> str:
    session_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO sessions VALUES (?, ?, ?)",
        (session_id, datetime.now().isoformat(), json.dumps(metadata or {}))
    )
    conn.commit()
    conn.close()
    return session_id


def save_comprehension(session_id: str, topic: str, grade_level: int,
                       learning_objective: str, content: dict) -> str:
    comp_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO comprehensions VALUES (?, ?, ?, ?, ?, ?, ?)",
        (comp_id, session_id, topic, grade_level,
         learning_objective, json.dumps(content), datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return comp_id


def get_session_history(session_id: str) -> list:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, session_id, topic, grade_level, learning_objective, content, created_at "
        "FROM comprehensions WHERE session_id = ? ORDER BY created_at DESC",
        (session_id,)
    )
    rows = c.fetchall()
    conn.close()
    return [
        {"id": r[0], "session_id": r[1], "topic": r[2], "grade_level": r[3],
         "learning_objective": r[4], "content": json.loads(r[5]), "created_at": r[6]}
        for r in rows
    ]


def get_all_comprehensions(limit: int = 50) -> list:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, session_id, topic, grade_level, learning_objective, content, created_at "
        "FROM comprehensions ORDER BY created_at DESC LIMIT ?",
        (limit,)
    )
    rows = c.fetchall()
    conn.close()
    return [
        {"id": r[0], "session_id": r[1], "topic": r[2], "grade_level": r[3],
         "learning_objective": r[4], "content": json.loads(r[5]), "created_at": r[6]}
        for r in rows
    ]


def save_rag_document(content: str, doc_type: str = "general",
                      topic: str = "", grade_level: int = 0) -> str:
    doc_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO rag_documents VALUES (?, ?, ?, ?, ?, ?)",
        (doc_id, content, doc_type, topic, grade_level, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return doc_id


def get_all_rag_documents() -> list:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, content, doc_type, topic, grade_level FROM rag_documents")
    rows = c.fetchall()
    conn.close()
    return [
        {"id": r[0], "content": r[1], "doc_type": r[2],
         "topic": r[3], "grade_level": r[4]}
        for r in rows
    ]
