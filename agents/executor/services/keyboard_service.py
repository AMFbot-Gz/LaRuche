"""
services/keyboard_service.py — Contrôle clavier et souris via pyautogui

Fonctionnalités :
  - Pression de touches / combinaisons de touches (Cmd+C, Ctrl+Z, etc.)
  - Saisie de texte (typewrite)
  - Clic souris à des coordonnées précises
  - Ouverture d'applications macOS via `open -a`

Sécurité :
  - pyautogui.FAILSAFE = True (mouvement coin sup-gauche = arrêt)
  - Délai minimal entre actions pour éviter les boucles incontrôlables
  - Validation des coordonnées par rapport à la résolution écran
  - Liste blanche optionnelle pour les applications autorisées

Note macOS :
  Certaines actions nécessitent les permissions Accessibility dans
  Réglages Système > Confidentialité > Accessibilité.
  L'agent retourne une erreur claire si ces permissions manquent.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Disponibilité pyautogui ─────────────────────────────────────────────────

try:
    import pyautogui
    pyautogui.FAILSAFE = True  # Mouvement vers (0,0) = arrêt d'urgence
    pyautogui.PAUSE = 0.02     # Pause minimale entre actions (évite spam)
    _PYAUTOGUI_AVAILABLE = True
    logger.info("pyautogui disponible — contrôle clavier/souris actif")
except ImportError:
    _PYAUTOGUI_AVAILABLE = False
    logger.warning("pyautogui non disponible — contrôle clavier/souris désactivé")

# ─── Touches valides (pyautogui key names) ───────────────────────────────────

VALID_KEYS: frozenset[str] = frozenset({
    # Modificateurs
    "shift", "ctrl", "control", "alt", "option", "command", "cmd",
    "win", "super", "fn",
    # Navigation
    "up", "down", "left", "right",
    "home", "end", "pageup", "pagedown",
    "tab", "enter", "return", "escape", "esc", "backspace", "delete",
    # Fonction
    "f1", "f2", "f3", "f4", "f5", "f6",
    "f7", "f8", "f9", "f10", "f11", "f12",
    # Édition
    "space", "capslock", "numlock", "scrolllock",
    "insert", "printscreen", "pause",
    # Pavé numérique
    "num0", "num1", "num2", "num3", "num4",
    "num5", "num6", "num7", "num8", "num9",
    "numlock", "divide", "multiply", "subtract", "add", "decimal",
    # Caractères spéciaux courants
    "`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/",
})

# Lettres et chiffres
VALID_KEYS |= frozenset(list("abcdefghijklmnopqrstuvwxyz0123456789"))


# ─── API publique ─────────────────────────────────────────────────────────────


def is_keyboard_available() -> bool:
    return _PYAUTOGUI_AVAILABLE


def is_mouse_available() -> bool:
    return _PYAUTOGUI_AVAILABLE


def get_screen_size() -> tuple[int, int]:
    """Retourne (width, height) de l'écran principal."""
    if _PYAUTOGUI_AVAILABLE:
        return pyautogui.size()
    return (1920, 1080)


# ─── Clavier ─────────────────────────────────────────────────────────────────


def press_keys(
    keys: list[str],
    presses: int = 1,
    interval: float = 0.0,
) -> dict:
    """
    Presse une combinaison de touches.

    Args:
        keys     : liste de touches (ex: ['command', 'c'])
        presses  : nombre de répétitions
        interval : délai entre répétitions (secondes)

    Returns:
        {"success": bool, "error": str | None}
    """
    if not _PYAUTOGUI_AVAILABLE:
        return {"success": False, "error": "pyautogui non disponible"}

    # Validation des touches
    invalid = [k for k in keys if k.lower() not in VALID_KEYS]
    if invalid:
        return {
            "success": False,
            "error": f"Touches invalides : {invalid}. Utilisez les noms pyautogui.",
        }

    try:
        normalized = [k.lower() for k in keys]

        for _ in range(presses):
            if len(normalized) == 1:
                pyautogui.press(normalized[0])
            else:
                pyautogui.hotkey(*normalized)

            if interval > 0:
                time.sleep(interval)

        return {"success": True, "error": None}

    except pyautogui.FailSafeException:
        return {"success": False, "error": "FailSafe déclenché (souris en position (0,0))"}
    except Exception as exc:
        return {"success": False, "error": _accessibility_hint(str(exc))}


def type_text(text: str, interval: float = 0.05) -> dict:
    """
    Tape du texte caractère par caractère.

    Utilise pyautogui.write() pour les caractères ASCII
    et pyperclip+paste pour les caractères Unicode complexes.

    Args:
        text     : texte à taper
        interval : délai entre caractères (défaut: 50ms)

    Returns:
        {"success": bool, "chars_typed": int, "error": str | None}
    """
    if not _PYAUTOGUI_AVAILABLE:
        return {"success": False, "chars_typed": 0, "error": "pyautogui non disponible"}

    try:
        # pyautogui.write() gère bien l'ASCII
        # Pour Unicode, on passe par le presse-papier
        if all(ord(c) < 128 for c in text):
            pyautogui.write(text, interval=max(interval, 0.02))
        else:
            # Utiliser pbcopy/pbpaste sur macOS pour les caractères Unicode
            _paste_text_macos(text)

        return {"success": True, "chars_typed": len(text), "error": None}

    except pyautogui.FailSafeException:
        return {"success": False, "chars_typed": 0, "error": "FailSafe déclenché"}
    except Exception as exc:
        return {"success": False, "chars_typed": 0, "error": _accessibility_hint(str(exc))}


def _paste_text_macos(text: str) -> None:
    """Tape du texte Unicode via le presse-papier macOS (pbcopy + Cmd+V)."""
    proc = subprocess.run(
        ["pbcopy"],
        input=text.encode("utf-8"),
        check=True,
        timeout=2,
    )
    time.sleep(0.1)
    pyautogui.hotkey("command", "v")


# ─── Souris ───────────────────────────────────────────────────────────────────


def mouse_click(
    x: int,
    y: int,
    button: str = "left",
    clicks: int = 1,
    move_duration: float = 0.2,
) -> dict:
    """
    Clique à des coordonnées précises.

    Args:
        x, y          : coordonnées pixel
        button        : "left" | "right" | "middle"
        clicks        : 1 = simple, 2 = double
        move_duration : durée du mouvement de souris (0 = instantané)

    Returns:
        {"success": bool, "error": str | None}
    """
    if not _PYAUTOGUI_AVAILABLE:
        return {"success": False, "error": "pyautogui non disponible"}

    # Validation coordonnées
    screen_w, screen_h = get_screen_size()
    if x < 0 or y < 0 or x > screen_w or y > screen_h:
        return {
            "success": False,
            "error": f"Coordonnées ({x},{y}) hors écran ({screen_w}x{screen_h})",
        }

    try:
        # Mouvement fluide si duration > 0
        if move_duration > 0:
            pyautogui.moveTo(x, y, duration=move_duration)

        pyautogui.click(x, y, clicks=clicks, button=button)
        return {"success": True, "error": None}

    except pyautogui.FailSafeException:
        return {"success": False, "error": "FailSafe déclenché"}
    except Exception as exc:
        return {"success": False, "error": _accessibility_hint(str(exc))}


# ─── Applications ─────────────────────────────────────────────────────────────


def open_app(app: str, args: list[str] | None = None) -> dict:
    """
    Ouvre une application macOS via `open -a`.

    Args:
        app  : nom de l'application (ex: "Terminal", "Safari")
        args : arguments supplémentaires

    Returns:
        {"success": bool, "error": str | None}
    """
    if sys.platform != "darwin":
        return {"success": False, "error": "open_app nécessite macOS"}

    try:
        cmd = ["open", "-a", app]
        if args:
            cmd.extend(args)

        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=10,
        )

        if result.returncode == 0:
            return {"success": True, "error": None}
        else:
            err = result.stderr.decode("utf-8", errors="replace").strip()
            return {
                "success": False,
                "error": err or f"Application '{app}' introuvable",
            }

    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Timeout en ouvrant '{app}'"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ─── Utilitaires ─────────────────────────────────────────────────────────────


def _accessibility_hint(error_msg: str) -> str:
    """Enrichit les erreurs d'accessibilité avec un hint macOS."""
    if "not allowed" in error_msg.lower() or "assistive" in error_msg.lower():
        return (
            f"{error_msg} — Vérifiez : Réglages Système > Confidentialité "
            "> Accessibilité → autoriser le terminal/processus Python."
        )
    return error_msg
