---
name: open-app
version: 1.0.0
description: "Ouvre une application macOS par son nom"
tags:
  - os
  - macos
  - app
tools:
  - os.openApp
  - os.focusApp
gpu_class: light
enabled: true
permissions:
  - hid
mcps:
  - mcp-browser
author: laruche-core
keywords:
  - ouvre
  - lance
  - ouvrir
  - démarrer
  - open
  - start
  - app
  - application
  - logiciel
---

## Description

Ouvre et met au premier plan une application macOS via son nom.

## Quand utiliser

Invoquer ce skill quand l'utilisateur :
- Demande d'ouvrir une application
- Veut accéder à une app (Safari, Chrome, Terminal, VSCode, Spotify...)
- Demande de lancer un logiciel

## Étapes

1. Appeler `os.openApp` avec le nom de l'application
2. Attendre 1-2 secondes pour l'ouverture
3. Si l'app est déjà ouverte : appeler `os.focusApp` pour la mettre au premier plan
4. Confirmer l'ouverture

## Applications supportées

Toute application installée dans `/Applications` ou `~/Applications`.
Exemples : Safari, Chrome, Firefox, Terminal, VSCode, Spotify, Finder, Notes, Mail.

## Exemples

- "Ouvre Safari"
- "Lance VSCode"
- "Ouvre Spotify"
- "Start Terminal"

## Limitations

- macOS uniquement
- Nom de l'application sensible à la casse
