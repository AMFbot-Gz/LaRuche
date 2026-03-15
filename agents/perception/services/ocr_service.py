"""
services/ocr_service.py — Extraction de texte par OCR

Utilise Tesseract via pytesseract.
Dégradation gracieuse si Tesseract n'est pas installé.

Preprocessing pipeline :
  1. Conversion en niveaux de gris
  2. Amélioration du contraste (CLAHE)
  3. Dénoise léger
  4. Binarisation adaptative (optionnelle)
  5. OCR Tesseract

Modes de sortie :
  text       → chaîne brute
  lines      → liste de lignes non vides
  words      → liste de mots avec scores de confiance
  structured → mots avec positions pixel
"""

from __future__ import annotations

import io
import logging
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Disponibilité Tesseract ──────────────────────────────────────────────────

try:
    import pytesseract
    from pytesseract import Output
    _PYTESSERACT_AVAILABLE = True
except ImportError:
    _PYTESSERACT_AVAILABLE = False
    logger.warning("pytesseract non disponible — OCR désactivé")

try:
    from PIL import Image, ImageFilter, ImageEnhance
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False


def get_tesseract_version() -> Optional[str]:
    """Retourne la version de Tesseract installée, None si absent."""
    if not _PYTESSERACT_AVAILABLE:
        return None
    try:
        return pytesseract.get_tesseract_version().vstring
    except Exception:
        try:
            # Fallback : appel direct tesseract --version
            result = subprocess.run(
                ["tesseract", "--version"],
                capture_output=True,
                text=True,
                timeout=3,
            )
            first_line = (result.stdout or result.stderr).split("\n")[0]
            return first_line.strip()
        except Exception:
            return None


def get_supported_languages() -> list[str]:
    """Retourne les langues Tesseract disponibles."""
    if not _PYTESSERACT_AVAILABLE:
        return []
    try:
        langs = pytesseract.get_languages(config="")
        return [l for l in langs if l != "osd"]
    except Exception:
        return ["eng"]  # défaut minimal


def is_ocr_available() -> bool:
    """True si pytesseract ET Tesseract système sont disponibles."""
    if not _PYTESSERACT_AVAILABLE:
        return False
    return get_tesseract_version() is not None


# ─── Preprocessing ────────────────────────────────────────────────────────────

def preprocess_image(image_bytes: bytes) -> bytes:
    """
    Améliore l'image pour l'OCR :
      - Grayscale (réduit le bruit couleur)
      - Contraste +30% (texte plus net)
      - Sharpening léger
    """
    if not _PIL_AVAILABLE:
        return image_bytes

    img = Image.open(io.BytesIO(image_bytes))

    # Conversion niveaux de gris
    img = img.convert("L")

    # Amélioration contraste
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.3)

    # Sharpening léger
    img = img.filter(ImageFilter.SHARPEN)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ─── OCR principal ────────────────────────────────────────────────────────────

def extract_text(
    image_bytes: bytes,
    lang: str = "eng+fra",
    mode: str = "text",
    preprocess: bool = True,
) -> dict:
    """
    Extrait le texte d'une image.

    Args:
        image_bytes : bytes PNG/JPEG de l'image source
        lang        : langues Tesseract (ex: "eng+fra")
        mode        : "text" | "lines" | "words" | "structured"
        preprocess  : appliquer le preprocessing avant OCR

    Returns:
        {
            "text":       str,
            "lines":      list[str],
            "words":      list[OcrWord] (si structured),
            "word_count": int,
            "confidence": float,  # 0-100
            "ocr_available": bool,
        }
    """
    if not is_ocr_available():
        return _no_ocr_response()

    if not _PIL_AVAILABLE:
        logger.error("Pillow requis pour l'OCR — manquant")
        return _no_ocr_response()

    # Preprocessing optionnel
    if preprocess:
        image_bytes = preprocess_image(image_bytes)

    # Chargement image Pillow
    img = Image.open(io.BytesIO(image_bytes))

    # ─── Mode structuré (positions pixel) ─────────────────────────────────────
    if mode == "structured":
        return _extract_structured(img, lang)

    # ─── Mode texte, lignes, mots (via image_to_string) ───────────────────────
    raw_text = _run_tesseract(img, lang)

    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    words = [w for w in raw_text.split() if w.strip()]
    confidence = _estimate_confidence(img, lang)

    return {
        "text":          raw_text.strip(),
        "lines":         lines,
        "words":         [],  # vide sauf en mode structured
        "word_count":    len(words),
        "confidence":    confidence,
        "ocr_available": True,
    }


def _run_tesseract(img: "Image.Image", lang: str) -> str:
    """Lance Tesseract et retourne le texte brut."""
    try:
        # PSM 6 = assume un bloc de texte uniforme (bon pour desktop)
        config = "--oem 3 --psm 6"
        return pytesseract.image_to_string(img, lang=lang, config=config)
    except pytesseract.TesseractNotFoundError:
        logger.error("Tesseract non trouvé dans PATH")
        return ""
    except Exception as exc:
        logger.warning("Tesseract erreur: %s", exc)
        return ""


def _extract_structured(img: "Image.Image", lang: str) -> dict:
    """Extrait le texte avec les positions pixel de chaque mot."""
    try:
        data = pytesseract.image_to_data(
            img,
            lang=lang,
            output_type=Output.DICT,
            config="--oem 3 --psm 6",
        )
    except Exception as exc:
        logger.warning("OCR structuré échoué: %s", exc)
        return _no_ocr_response()

    words = []
    confidences = []

    for i, text in enumerate(data["text"]):
        text = text.strip()
        if not text:
            continue

        conf = float(data["conf"][i])
        if conf < 0:  # conf = -1 signifie "pas de mot"
            continue

        words.append({
            "text":       text,
            "confidence": conf,
            "x":          data["left"][i],
            "y":          data["top"][i],
            "width":      data["width"][i],
            "height":     data["height"][i],
        })
        confidences.append(conf)

    full_text = " ".join(w["text"] for w in words)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "text":          full_text,
        "lines":         [line for line in full_text.splitlines() if line.strip()],
        "words":         words,
        "word_count":    len(words),
        "confidence":    round(avg_conf, 1),
        "ocr_available": True,
    }


def _estimate_confidence(img: "Image.Image", lang: str) -> float:
    """Estime le score de confiance moyen en mode non-structuré."""
    try:
        data = pytesseract.image_to_data(
            img,
            lang=lang,
            output_type=Output.DICT,
            config="--oem 3 --psm 6",
        )
        confs = [float(c) for c in data["conf"] if float(c) > 0]
        return round(sum(confs) / len(confs), 1) if confs else 0.0
    except Exception:
        return 0.0


def _no_ocr_response() -> dict:
    """Réponse dégradée quand Tesseract n'est pas disponible."""
    return {
        "text":          "",
        "lines":         [],
        "words":         [],
        "word_count":    0,
        "confidence":    0.0,
        "ocr_available": False,
    }


# ─── Analyse visuelle (sans OCR) ──────────────────────────────────────────────

def analyze_image_visual(image_bytes: bytes) -> dict:
    """
    Analyse visuelle rapide : dimensions, luminosité, couleurs dominantes.
    Ne nécessite pas Tesseract.
    """
    if not _PIL_AVAILABLE:
        return {"width": 0, "height": 0, "brightness": 0.0, "dominant_colors": []}

    img = Image.open(io.BytesIO(image_bytes))
    width, height = img.size

    # Luminosité moyenne (via grayscale)
    gray = img.convert("L")
    pixels = list(gray.getdata())
    brightness = sum(pixels) / len(pixels) if pixels else 0.0

    # Couleurs dominantes (3 plus fréquentes via quantization)
    dominant = _get_dominant_colors(img, n=3)

    return {
        "width":            width,
        "height":           height,
        "brightness":       round(brightness, 1),
        "dominant_colors":  dominant,
    }


def _get_dominant_colors(img: "Image.Image", n: int = 3) -> list[str]:
    """Extrait les N couleurs dominantes via quantization Pillow."""
    try:
        # Réduire la résolution pour la rapidité
        small = img.copy()
        small.thumbnail((100, 100), Image.LANCZOS)
        # Quantize en n couleurs
        quantized = small.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette()
        colors = []
        for i in range(n):
            r, g, b = palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]
            colors.append(f"#{r:02x}{g:02x}{b:02x}")
        return colors
    except Exception:
        return []
