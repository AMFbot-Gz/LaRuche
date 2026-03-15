"""
perception_agent.py — FastAPI app pour le Perception Agent (:8002)

Le Perception Agent est les yeux de Chimera. Il :
  1. Capture l'écran (entier ou région) sur demande
  2. Extrait le texte via OCR (Tesseract)
  3. Analyse le contenu visuel (couleurs, luminosité, présence de texte)
  4. Permet de chercher un texte spécifique sur l'écran

Endpoints :
  GET  /health      — liveness check (HealthMonitor Queen)
  GET  /status      — capacités détaillées (OCR dispo, résolution, moniteurs)
  POST /screenshot  — capture d'écran → base64 PNG/JPEG
  POST /ocr         — screenshot + OCR → texte extrait
  POST /screen_text — alias /ocr simplifié (texte brut uniquement)
  POST /find_text   — cherche un texte précis sur l'écran
  POST /analyze     — analyse visuelle rapide (dimensions, couleurs, texte)

Lancement :
  uvicorn agents.perception.perception_agent:app --port 8002 --reload
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException

from agents.perception.schemas.perception_schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    FindTextRequest,
    FindTextResponse,
    OcrRequest,
    OcrResponse,
    OcrWord,
    ScreenshotRequest,
    ScreenshotResponse,
    StatusResponse,
)
from agents.perception.services import ocr_service, screenshot_service

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Perception Agent",
    description="Les yeux de Chimera — capture d'écran, OCR et analyse visuelle",
    version="1.0.0",
)


# ─── /health ──────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Liveness check — format stable pour Queen HealthMonitor."""
    return {
        "status":             "ok",
        "service":            "perception",
        "timestamp":          datetime.now(timezone.utc).isoformat(),
        "screenshot_backend": screenshot_service.get_screenshot_backend(),
        "ocr_available":      ocr_service.is_ocr_available(),
    }


# ─── /status ──────────────────────────────────────────────────────────────────


@app.get("/status", response_model=StatusResponse)
async def status() -> StatusResponse:
    """Capacités détaillées de l'agent (moniteurs, langues OCR, version Tesseract)."""
    return StatusResponse(
        service=             "perception",
        ocr_available=        ocr_service.is_ocr_available(),
        tesseract_version=    ocr_service.get_tesseract_version(),
        screen_count=         screenshot_service.get_screen_count(),
        screens=              screenshot_service.get_screens_info(),
        screenshot_backend=   screenshot_service.get_screenshot_backend(),
        supported_languages=  ocr_service.get_supported_languages(),
    )


# ─── /screenshot ──────────────────────────────────────────────────────────────


@app.post("/screenshot", response_model=ScreenshotResponse)
async def take_screenshot(req: ScreenshotRequest) -> ScreenshotResponse:
    """
    Capture l'écran et retourne l'image en base64.

    - region: zone spécifique (None = écran entier)
    - display: numéro du moniteur (1 = primaire)
    - scale: facteur de redimensionnement (0.5 = moitié résolution)
    - format: "png" (sans perte) ou "jpeg" (plus léger)

    Lève 503 si aucun backend de capture n'est disponible.
    """
    t0 = time.monotonic()

    region_dict = None
    if req.region and (req.region.width > 0 or req.region.height > 0):
        region_dict = {
            "x":      req.region.x,
            "y":      req.region.y,
            "width":  req.region.width,
            "height": req.region.height,
        }

    try:
        raw_bytes, width, height = screenshot_service.capture_screenshot(
            region=region_dict,
            display=req.display,
            scale=req.scale,
            fmt=req.format,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    duration_ms = int((time.monotonic() - t0) * 1000)

    return ScreenshotResponse(
        image_base64=screenshot_service.encode_base64(raw_bytes),
        format=req.format,
        width=width,
        height=height,
        display=req.display,
        duration_ms=duration_ms,
    )


# ─── /ocr ─────────────────────────────────────────────────────────────────────


@app.post("/ocr", response_model=OcrResponse)
async def ocr(req: OcrRequest) -> OcrResponse:
    """
    Capture l'écran et extrait le texte via OCR (Tesseract).

    Si Tesseract n'est pas installé, retourne ocr_available=False et text="".
    L'agent ne crashe jamais — il dégrade gracieusement.

    Modes :
      - text       : texte brut (défaut)
      - lines      : liste de lignes
      - words      : liste de mots (sans positions)
      - structured : mots avec coordonnées pixel
    """
    t0 = time.monotonic()

    # Capture
    region_dict = _region_to_dict(req.region)
    try:
        raw_bytes, _, _ = screenshot_service.capture_screenshot(
            region=region_dict,
            display=req.display,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=f"Screenshot impossible: {exc}")

    # OCR
    result = ocr_service.extract_text(
        image_bytes=raw_bytes,
        lang=req.lang,
        mode=req.mode,
        preprocess=req.preprocess,
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    # Conversion des mots structurés en OcrWord
    words = [OcrWord(**w) for w in result.get("words", [])]

    return OcrResponse(
        text=        result["text"],
        lines=       result["lines"],
        words=       words,
        language=    req.lang,
        word_count=  result["word_count"],
        confidence=  result["confidence"],
        ocr_available=result["ocr_available"],
        duration_ms= duration_ms,
    )


# ─── /screen_text ─────────────────────────────────────────────────────────────


@app.post("/screen_text")
async def screen_text(display: int = 1, lang: str = "eng+fra") -> dict:
    """
    Endpoint simplifié : retourne directement le texte de l'écran.

    Idéal pour les agents qui veulent juste savoir "qu'est-ce qui est affiché".
    """
    t0 = time.monotonic()

    try:
        raw_bytes, _, _ = screenshot_service.capture_screenshot(display=display)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    result = ocr_service.extract_text(raw_bytes, lang=lang, mode="text")
    duration_ms = int((time.monotonic() - t0) * 1000)

    return {
        "text":          result["text"],
        "word_count":    result["word_count"],
        "ocr_available": result["ocr_available"],
        "duration_ms":   duration_ms,
    }


# ─── /find_text ───────────────────────────────────────────────────────────────


@app.post("/find_text", response_model=FindTextResponse)
async def find_text(req: FindTextRequest) -> FindTextResponse:
    """
    Cherche un texte précis sur l'écran et retourne sa position.

    Utilise l'OCR structuré pour obtenir les coordonnées pixel de chaque mot.
    Retourne found=False si le texte n'est pas visible ou si OCR indisponible.
    """
    t0 = time.monotonic()

    region_dict = _region_to_dict(req.region)
    try:
        raw_bytes, _, _ = screenshot_service.capture_screenshot(
            region=region_dict,
            display=req.display,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # OCR structuré pour avoir les positions
    result = ocr_service.extract_text(
        raw_bytes,
        lang="eng+fra",
        mode="structured",
    )

    # Recherche du texte cible
    query = req.text if req.case_sensitive else req.text.lower()
    matches = []

    for word_data in result.get("words", []):
        word_text = word_data["text"]
        compare = word_text if req.case_sensitive else word_text.lower()
        if query in compare:
            matches.append(OcrWord(**word_data))

    duration_ms = int((time.monotonic() - t0) * 1000)

    return FindTextResponse(
        found=             len(matches) > 0,
        matches=           matches,
        query=             req.text,
        total_screen_text= result["text"],
        duration_ms=       duration_ms,
    )


# ─── /analyze ─────────────────────────────────────────────────────────────────


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyse visuelle rapide de l'écran.

    Retourne : dimensions, luminosité, couleurs dominantes.
    Si include_ocr=True (défaut), extrait aussi le texte visible.

    Ne nécessite pas Tesseract si include_ocr=False.
    """
    t0 = time.monotonic()

    region_dict = _region_to_dict(req.region)
    try:
        raw_bytes, _, _ = screenshot_service.capture_screenshot(
            region=region_dict,
            display=req.display,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Analyse visuelle
    visual = ocr_service.analyze_image_visual(raw_bytes)

    # OCR optionnel
    text = ""
    word_count = 0
    if req.include_ocr:
        ocr_result = ocr_service.extract_text(raw_bytes, mode="text")
        text = ocr_result["text"]
        word_count = ocr_result["word_count"]

    duration_ms = int((time.monotonic() - t0) * 1000)

    return AnalyzeResponse(
        width=             visual["width"],
        height=            visual["height"],
        dominant_colors=   visual["dominant_colors"],
        brightness=        visual["brightness"],
        has_text=          word_count > 0,
        text_preview=      text[:200],
        text_word_count=   word_count,
        duration_ms=       duration_ms,
    )


# ─── Utilitaires ──────────────────────────────────────────────────────────────


def _region_to_dict(region) -> dict | None:
    """Convertit un objet Region Pydantic en dict ou None."""
    if region and (region.width > 0 or region.height > 0):
        return {"x": region.x, "y": region.y, "width": region.width, "height": region.height}
    return None


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "agents.perception.perception_agent:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
    )
