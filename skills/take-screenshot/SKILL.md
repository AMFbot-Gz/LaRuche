---
name: take-screenshot
version: 1.0.0
description: "Capture l'écran et retourne le chemin du fichier PNG"
tags:
  - vision
  - screenshot
  - os
tools:
  - hid.screenshot
  - pw.screenshot
gpu_class: light
enabled: true
permissions:
  - hid
mcps:
  - mcp-os-control
  - mcp-playwright
author: laruche-core
keywords:
  - screenshot
  - capture
  - écran
  - photo
  - prends une photo
  - montre
  - vois
---

## Description

Capture l'état actuel de l'écran et sauvegarde en PNG.
Priorise Playwright (plus fiable en headless) puis HID comme fallback.

## Quand utiliser

Invoquer ce skill quand :
- L'utilisateur demande une capture d'écran
- Le pipeline vision a besoin d'analyser l'état de l'UI
- Une étape de vision validation est requise
- L'utilisateur demande "qu'est-ce qui est affiché ?"

## Étapes

1. Tenter `pw.screenshot` (Playwright — haute qualité, headless)
2. En cas d'échec, fallback sur `hid.screenshot` (RobotJS)
3. Sauvegarder dans `.laruche/temp/screenshots/shot_<timestamp>.png`
4. Retourner le chemin du fichier

## Output

```json
{
  "success": true,
  "path": ".laruche/temp/screenshots/shot_1709800000000.png",
  "width": 1920,
  "height": 1080,
  "timestamp": 1709800000000
}
```

## Limitations

- Nécessite un affichage disponible (pas de SSH headless pur)
- Fichiers non purgés automatiquement (janitor.purge les supprime)
