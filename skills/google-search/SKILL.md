---
name: google-search
version: 1.0.0
description: "Effectue une recherche Google et retourne les résultats"
tags:
  - web
  - search
  - information
tools:
  - browser.goto
  - browser.typeInFocusedField
  - browser.pressEnter
  - extract_text
gpu_class: light
enabled: true
permissions:
  - browser
mcps:
  - mcp-browser
author: laruche-core
keywords:
  - cherche
  - recherche
  - google
  - trouve
  - lookup
  - search
  - "qu'est-ce que"
  - définition
---

## Description

Effectue une recherche sur Google et retourne les résultats pertinents.

## Quand utiliser

Invoquer ce skill quand l'utilisateur :
- Demande de chercher quelque chose sur le web
- Veut trouver une information, une définition, un article
- Formule une question factuelle ("qu'est-ce que X", "qui est Y")
- Demande de googler quelque chose

## Étapes

1. Ouvrir `https://google.com` dans le navigateur
2. Cliquer dans le champ de recherche
3. Taper la requête de recherche
4. Appuyer sur Entrée
5. Attendre les résultats
6. Extraire les 5 premiers résultats (titre + description + URL)

## Exemples

- "Cherche les dernières nouvelles sur l'IA"
- "Google me trouve des recettes de tiramisu"
- "Qu'est-ce que le modèle Transformer ?"
- "Search for Python async tutorials"

## Limitations

- Ne peut pas accéder aux contenus derrière un paywall
- Limité aux ~5 premiers résultats visibles
- Nécessite un navigateur ouvert (Chrome, Safari, Firefox)
