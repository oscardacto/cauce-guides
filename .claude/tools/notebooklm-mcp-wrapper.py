"""Wrapper to launch NotebookLM MCP server from uv venv."""
import sys
import os

# Ensure the uv tool venv is in the path
venv_path = os.path.join(
    os.environ.get("APPDATA", ""),
    "uv", "tools", "notebooklm-mcp-cli", "Lib", "site-packages"
)
if venv_path not in sys.path:
    sys.path.insert(0, venv_path)

from notebooklm_tools.mcp.server import main
main()
