"""
conftest.py — Configuration pytest pour le MCP-Bridge Agent.

Ajoute agents/mcp-bridge/ au sys.path pour permettre l'import direct
des modules du bridge (mcp_bridge_agent, schemas.*, services.*).

Le répertoire s'appelle 'mcp-bridge' (avec tiret) — non importable directement
via la hiérarchie agents.mcp_bridge. Ce conftest contourne cette limitation.
"""

import sys
from pathlib import Path

# Chemin vers agents/mcp-bridge/
_BRIDGE_DIR = Path(__file__).parent.parent
# Chemin vers la racine chimera/ (pour les imports agents.*)
_ROOT_DIR = _BRIDGE_DIR.parent.parent

# Ajoute agents/mcp-bridge/ en premier pour que les imports directs fonctionnent
sys.path.insert(0, str(_BRIDGE_DIR))
# Ajoute chimera/ pour les imports agents.brain.* etc si nécessaire
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(1, str(_ROOT_DIR))
