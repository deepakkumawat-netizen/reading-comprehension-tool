from database import get_session_history, get_all_comprehensions, save_rag_document
from rag import rag_retriever

MCP_TOOLS = [
    {
        "name": "get_session_history",
        "description": "Retrieve all reading comprehensions generated in a specific session",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "The session UUID"}
            },
            "required": ["session_id"]
        }
    },
    {
        "name": "search_comprehensions",
        "description": "Search past reading activities by topic and optional grade level using RAG",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Topic or keyword to search"},
                "grade_level": {"type": "integer", "description": "Filter by grade level (optional)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "add_knowledge",
        "description": "Add educational content to the RAG knowledge base for richer passages",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Educational text content"},
                "topic": {"type": "string", "description": "Topic of the content"},
                "grade_level": {"type": "integer", "description": "Target grade level"}
            },
            "required": ["content"]
        }
    }
]


async def execute_mcp_tool(tool_name: str, args: dict):
    if tool_name == "get_session_history":
        return get_session_history(args["session_id"])

    elif tool_name == "search_comprehensions":
        rag_retriever.build_index()
        results = rag_retriever.retrieve(
            args["query"],
            top_k=5,
            grade_filter=args.get("grade_level")
        )
        return [
            {
                "topic": r["metadata"]["data"].get("topic", ""),
                "grade_level": r["metadata"]["data"].get("grade_level", ""),
                "score": r["score"]
            }
            for r in results
        ]

    elif tool_name == "add_knowledge":
        doc_id = save_rag_document(
            content=args["content"],
            doc_type="knowledge",
            topic=args.get("topic", ""),
            grade_level=args.get("grade_level", 0)
        )
        rag_retriever.build_index()
        return {"doc_id": doc_id, "status": "added to knowledge base"}

    else:
        raise ValueError(f"Unknown MCP tool: {tool_name}")
