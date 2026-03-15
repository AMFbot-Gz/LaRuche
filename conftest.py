"""
conftest.py — Chimera root conftest

Ensures the chimera/ directory is always on sys.path so that
`import agents.*` works from any test in the monorepo.
"""

import sys
from pathlib import Path

# Add chimera/ to path (parent of this file)
sys.path.insert(0, str(Path(__file__).parent))
