"""
schemas/perception_schemas.py — Pydantic models pour l'API Perception Agent.

Tous les endpoints entrée/sortie sont typés ici.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field

from agents.perception.services.vision_service import VisionAnalysis


# ─── /screenshot ──────────────────────────────────────────────────────────────


class Region(BaseModel):
    """Région de l'écran à capturer (coordonnées pixels)."""

    x: int = Field(default=0, ge=0, description="Coin gauche (pixels)")
    y: int = Field(default=0, ge=0, description="Coin haut (pixels)")
    width: int = Field(default=0, ge=0, description="Largeur (0 = plein écran)")
    height: int = Field(default=0, ge=0, description="Hauteur (0 = plein écran)")


class ScreenshotRequest(BaseModel):
    """Requête de capture d'écran."""

    region: Optional[Region] = Field(
        default=None,
        description="Zone à capturer. None = écran entier.",
    )
    display: int = Field(
        default=1,
        ge=1,
        description="Numéro du moniteur (1 = primaire)",
    )
    format: str = Field(
        default="png",
        description="Format de l'image : png | jpeg",
        pattern="^(png|jpeg)$",
    )
    scale: float = Field(
        default=1.0,
        ge=0.1,
        le=2.0,
        description="Facteur de redimensionnement (0.5 = moitié de la résolution)",
    )


class ScreenshotResponse(BaseModel):
    """Réponse d'une capture d'écran."""

    image_base64: str = Field(description="Image encodée en base64")
    format: str = Field(description="Format de l'image : png | jpeg")
    width: int = Field(description="Largeur en pixels")
    height: int = Field(description="Hauteur en pixels")
    display: int = Field(description="Numéro du moniteur capturé")
    duration_ms: int = Field(description="Durée de la capture en millisecondes")


# ─── /ocr ─────────────────────────────────────────────────────────────────────


class OcrRequest(BaseModel):
    """Requête OCR : capture + extraction de texte."""

    region: Optional[Region] = Field(
        default=None,
        description="Zone à analyser. None = écran entier.",
    )
    display: int = Field(default=1, ge=1)
    lang: str = Field(
        default="eng+fra",
        description="Langue(s) Tesseract (ex: 'eng', 'eng+fra', 'fra')",
    )
    mode: str = Field(
        default="text",
        description="Mode de sortie : text | lines | words | structured",
        pattern="^(text|lines|words|structured)$",
    )
    preprocess: bool = Field(
        default=True,
        description="Appliquer le preprocessing (contraste, dénoise) avant OCR",
    )


class OcrWord(BaseModel):
    """Un mot détecté avec sa position."""

    text: str
    confidence: float
    x: int
    y: int
    width: int
    height: int


class OcrResponse(BaseModel):
    """Réponse OCR avec le texte extrait."""

    text: str = Field(description="Texte brut extrait de l'écran")
    lines: list[str] = Field(default_factory=list, description="Texte découpé par ligne")
    words: list[OcrWord] = Field(
        default_factory=list,
        description="Mots avec positions (uniquement si mode='structured')",
    )
    language: str = Field(description="Langue utilisée pour l'OCR")
    word_count: int = Field(description="Nombre de mots détectés")
    confidence: float = Field(description="Score de confiance moyen (0-100)")
    ocr_available: bool = Field(description="True si Tesseract est installé")
    duration_ms: int = Field(description="Durée totale (screenshot + OCR) en ms")


# ─── /find_text ───────────────────────────────────────────────────────────────


class FindTextRequest(BaseModel):
    """Cherche un texte précis sur l'écran et retourne sa position."""

    text: str = Field(..., min_length=1, description="Texte à chercher sur l'écran")
    case_sensitive: bool = Field(default=False)
    region: Optional[Region] = Field(default=None)
    display: int = Field(default=1, ge=1)


class FindTextResponse(BaseModel):
    """Résultat d'une recherche de texte sur l'écran."""

    found: bool
    matches: list[OcrWord] = Field(
        default_factory=list,
        description="Positions de chaque occurrence trouvée",
    )
    query: str
    total_screen_text: str = Field(description="Texte complet de l'écran (pour contexte)")
    duration_ms: int


# ─── /analyze ─────────────────────────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    """Analyse visuelle rapide de l'écran."""

    region: Optional[Region] = Field(default=None)
    display: int = Field(default=1, ge=1)
    include_ocr: bool = Field(
        default=True,
        description="Inclure l'extraction de texte dans l'analyse",
    )


class AnalyzeResponse(BaseModel):
    """Analyse visuelle de l'écran."""

    width: int
    height: int
    dominant_colors: list[str] = Field(
        default_factory=list,
        description="3 couleurs dominantes (hex)",
    )
    brightness: float = Field(description="Luminosité moyenne (0-255)")
    has_text: bool = Field(description="True si du texte a été détecté")
    text_preview: str = Field(description="Premiers 200 caractères du texte détecté")
    text_word_count: int
    duration_ms: int


# ─── /vision_understand ───────────────────────────────────────────────────────


class VisionUnderstandRequest(BaseModel):
    """Requête d'analyse Claude Vision : screenshot + goal."""

    screenshot_b64: str = Field(
        ...,
        description="Screenshot PNG encodé en base64",
    )
    goal: str = Field(
        ...,
        min_length=1,
        description="Objectif à atteindre en langage naturel",
    )
    history: list[dict] = Field(
        default_factory=list,
        description="Historique des actions précédentes (optionnel)",
    )


class VisionUnderstandResponse(BaseModel):
    """Réponse de l'analyse Claude Vision."""

    analysis: VisionAnalysis


# ─── /status ──────────────────────────────────────────────────────────────────


class StatusResponse(BaseModel):
    """État détaillé des capacités de l'agent."""

    service: str
    ocr_available: bool
    tesseract_version: Optional[str]
    screen_count: int
    screens: list[dict]
    screenshot_backend: str
    supported_languages: list[str]
