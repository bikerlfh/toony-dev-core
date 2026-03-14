import os

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from toony_mcp.client import ToonyClient

load_dotenv()

mcp = FastMCP(
    "Toony Dev Core",
    host=os.environ.get("MCP_HOST", "127.0.0.1"),
    port=int(os.environ.get("MCP_PORT", "8001")),
)

_client: ToonyClient | None = None


def get_client() -> ToonyClient:
    global _client
    if _client is None:
        api_url = os.environ.get("TOONY_API_URL", "http://localhost:8000/api")
        api_key = os.environ.get("TOONY_API_KEY", "")
        if not api_key:
            raise RuntimeError("TOONY_API_KEY environment variable is required")
        _client = ToonyClient(api_url, api_key)
    return _client


def main():
    import toony_mcp.tools.issues  # noqa: F401
    import toony_mcp.tools.projects  # noqa: F401
    import toony_mcp.tools.workspace  # noqa: F401
    import toony_mcp.tools.workflows  # noqa: F401
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    mcp.run(transport=transport)


if __name__ == "__main__":
    main()
