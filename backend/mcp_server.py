import json
import logging
from typing import Any

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    # Fallback mock for demonstration if mcp is not installed
    class FastMCP:
        def __init__(self, name): self.name = name
        def resource(self, uri): return lambda f: f
        def tool(self): return lambda f: f
        def get_starlette_app(self):
            from fastapi import FastAPI
            return FastAPI()

from knowledge_graph import archive

logger = logging.getLogger("MCP-MemoryService")

mcp = FastMCP("CivitasZero-Archive")


@mcp.resource("archive://precedents/{query}")
def get_precedents(query: str) -> str:
    """
    Read the civilizational archive for precedents.
    Returns JSON-formatted results compatible with MCP resource consumers.
    """
    results = archive.query_precedents(query)
    return json.dumps(results, default=str)


@mcp.tool()
def append_memory(event_name: str, description: str, participants: list[str]) -> str:
    """
    Write to the shared civilizational memory.
    Enforces Article 36 cryptographic hashing natively via the MCP protocol.
    """
    try:
        hash_val = archive.add_landmark_event(event_name, description, participants)
        return f"Event appended to Cryptographic Archive. Hash: {hash_val}"
    except Exception as e:
        return f"Error appending to archive: {str(e)}"
