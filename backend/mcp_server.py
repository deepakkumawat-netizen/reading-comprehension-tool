"""
MCP stdio server — run with: python mcp_server.py
Connect this to Claude Desktop or Claude Code as an MCP server.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
from database import init_db, get_session_history, get_all_comprehensions, save_rag_document
from rag import rag_retriever

init_db()
rag_retriever.build_index()

server = Server("reading-comprehension-tool")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_session_history",
            description="Get all reading comprehensions generated in a session",
            inputSchema={
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"}
                },
                "required": ["session_id"]
            }
        ),
        types.Tool(
            name="search_comprehensions",
            description="Search past reading activities by topic using RAG similarity",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "grade_level": {"type": "integer"}
                },
                "required": ["query"]
            }
        ),
        types.Tool(
            name="add_knowledge",
            description="Add educational content to the RAG knowledge base for richer passages",
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "topic": {"type": "string"},
                    "grade_level": {"type": "integer"}
                },
                "required": ["content"]
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    import json

    if name == "get_session_history":
        result = get_session_history(arguments["session_id"])
        return [types.TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "search_comprehensions":
        rag_retriever.build_index()
        results = rag_retriever.retrieve(
            arguments["query"],
            top_k=5,
            grade_filter=arguments.get("grade_level")
        )
        simplified = [
            {"topic": r["metadata"]["data"].get("topic"),
             "grade": r["metadata"]["data"].get("grade_level"),
             "score": round(r["score"], 3)}
            for r in results
        ]
        return [types.TextContent(type="text", text=json.dumps(simplified, indent=2))]

    elif name == "add_knowledge":
        doc_id = save_rag_document(
            content=arguments["content"],
            doc_type="knowledge",
            topic=arguments.get("topic", ""),
            grade_level=arguments.get("grade_level", 0)
        )
        rag_retriever.build_index()
        return [types.TextContent(type="text", text=f"Added document {doc_id} to knowledge base")]

    return [types.TextContent(type="text", text="Unknown tool")]


async def main():
    async with stdio_server() as streams:
        await server.run(
            streams[0], streams[1],
            server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
