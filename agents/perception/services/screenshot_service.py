"""
services/screenshot_service.py — Capture d'écran cross-platform

Stratégie :
  1. mss (primaire)   — léger, cross-platform (macOS/Linux/Windows)
  2. screencapture    — fallback macOS natif (si mss échoue)

Retourne toujours des bytes PNG.
"""

from __future__ import annotations

import base64
import io
import logging
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Tentative d'import mss (dépendance optionnelle)
try:
    import mss
    import mss.tools
    _MSS_AVAILABLE = True
except ImportError:
    _MSS_AVAILABLE = False
    logger.warning("mss non disponible — fallback macOS screencapture activé")

# Tentative d'import Pillow (pour redimensionnement)
try:
    from PIL import Image
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False
    logger.warning("Pillow non disponible — redimensionnement désactivé")


# ─── Backend detection ────────────────────────────────────────────────────────

def get_screenshot_backend() -> str:
    """Retourne le backend screenshot actif."""
    if _MSS_AVAILABLE:
        return "mss"
    if sys.platform == "darwin":
        return "screencapture"
    return "unavailable"


def get_screen_count() -> int:
    """Retourne le nombre de moniteurs détectés."""
    if _MSS_AVAILABLE:
        with mss.mss() as sct:
            # monitors[0] = virtuel (tous), monitors[1:] = réels
            return len(sct.monitors) - 1
    return 1  # défaut si mss absent


def get_screens_info() -> list[dict]:
    """Retourne les informations sur chaque moniteur."""
    if _MSS_AVAILABLE:
        with mss.mss() as sct:
            return [
                {
                    "index": i,
                    "left": m["left"],
                    "top": m["top"],
                    "width": m["width"],
                    "height": m["height"],
                }
                for i, m in enumerate(sct.monitors[1:], start=1)
            ]
    return [{"index": 1, "width": 1920, "height": 1080, "left": 0, "top": 0}]


# ─── Capture principale ───────────────────────────────────────────────────────

def capture_screenshot(
    region: Optional[dict] = None,
    display: int = 1,
    scale: float = 1.0,
    fmt: str = "png",
) -> tuple[bytes, int, int]:
    """
    Capture l'écran et retourne (image_bytes, width, height).

    Args:
        region  : {"x": int, "y": int, "width": int, "height": int} ou None
        display : numéro du moniteur (1-indexed)
        scale   : facteur de redimensionnement (1.0 = original)
        fmt     : "png" ou "jpeg"

    Returns:
        (bytes PNG/JPEG, width, height)

    Raises:
        RuntimeError : si aucun backend disponible
    """
    if _MSS_AVAILABLE:
        return _capture_mss(region, display, scale, fmt)
    elif sys.platform == "darwin":
        return _capture_screencapture(region, scale, fmt)
    else:
        raise RuntimeError(
            "Aucun backend screenshot disponible. "
            "Installez mss : pip install mss"
        )


# ─── Backend mss ─────────────────────────────────────────────────────────────

def _capture_mss(
    region: Optional[dict],
    display: int,
    scale: float,
    fmt: str,
) -> tuple[bytes, int, int]:
    """Capture via mss (cross-platform)."""
    with mss.mss() as sct:
        # Sélection du moniteur
        monitors = sct.monitors
        if display < 1 or display >= len(monitors):
            display = 1
        monitor_info = monitors[display]

        # Construction de la zone de capture
        if region and region.get("width") and region.get("height"):
            mon = {
                "left":   monitor_info["left"] + region["x"],
                "top":    monitor_info["top"]  + region["y"],
                "width":  region["width"],
                "height": region["height"],
                "mon":    display,
            }
        else:
            mon = monitor_info

        # Capture
        sct_img = sct.grab(mon)
        raw_bytes = mss.tools.to_png(sct_img.rgb, sct_img.size)
        width, height = sct_img.size

    # Redimensionnement si scale != 1.0
    if scale != 1.0 and _PIL_AVAILABLE:
        raw_bytes, width, height = _resize_image(raw_bytes, scale, fmt)
    elif scale != 1.0:
        logger.warning("scale != 1.0 ignoré — Pillow non disponible")

    # Conversion format si jpeg demandé
    if fmt == "jpeg" and _PIL_AVAILABLE:
        raw_bytes = _convert_to_jpeg(raw_bytes)

    return raw_bytes, width, height


# ─── Backend screencapture (macOS) ────────────────────────────────────────────

def _capture_screencapture(
    region: Optional[dict],
    scale: float,
    fmt: str,
) -> tuple[bytes, int, int]:
    """Capture via screencapture macOS (fallback si mss absent)."""
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as f:
        tmpfile = f.name

    try:
        cmd = ["screencapture", "-x", "-t", fmt]  # -x = no sound

        # Capture d'une région spécifique
        if region and region.get("width") and region.get("height"):
            x, y, w, h = region["x"], region["y"], region["width"], region["height"]
            cmd.extend(["-R", f"{x},{y},{w},{h}"])

        cmd.append(tmpfile)
        subprocess.run(cmd, check=True, timeout=5, capture_output=True)

        with open(tmpfile, "rb") as f:
            raw_bytes = f.read()

    finally:
        Path(tmpfile).unlink(missing_ok=True)

    # Dimensions via Pillow
    width, height = 1920, 1080  # défaut
    if _PIL_AVAILABLE:
        img = Image.open(io.BytesIO(raw_bytes))
        width, height = img.size
        if scale != 1.0:
            raw_bytes, width, height = _resize_image(raw_bytes, scale, fmt)

    return raw_bytes, width, height


# ─── Utilitaires image ────────────────────────────────────────────────────────

def _resize_image(image_bytes: bytes, scale: float, fmt: str) -> tuple[bytes, int, int]:
    """Redimensionne une image par un facteur scale."""
    img = Image.open(io.BytesIO(image_bytes))
    new_w = int(img.width * scale)
    new_h = int(img.height * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format=fmt.upper())
    return buf.getvalue(), new_w, new_h


def _convert_to_jpeg(image_bytes: bytes) -> bytes:
    """Convertit une image PNG en JPEG (plus léger pour le transport)."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


def encode_base64(image_bytes: bytes) -> str:
    """Encode des bytes image en base64 string."""
    return base64.b64encode(image_bytes).decode("utf-8")
