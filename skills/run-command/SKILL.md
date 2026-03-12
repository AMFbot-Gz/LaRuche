---
name: run-command
version: 1.0.0
description: "Exécute une commande shell dans le terminal (avec HITL si risquée)"
tags:
  - terminal
  - system
  - devops
tools:
  - terminal.safe
  - terminal.run
gpu_class: light
enabled: true
permissions:
  - terminal
mcps:
  - mcp-terminal
author: laruche-core
keywords:
  - exécute
  - lance
  - terminal
  - commande
  - bash
  - run
  - execute
  - script
hitl_required: true
hitl_threshold: 0.7
---

## Description

Exécute une commande shell dans le terminal local.
Toute commande avec un niveau de risque ≥ 0.7 déclenche une validation HITL.

## Quand utiliser

Invoquer ce skill quand l'utilisateur :
- Demande d'exécuter une commande terminal
- Veut lancer un script
- Demande de vérifier un processus, un port, les logs
- Demande une opération système (install, build, test)

## Évaluation du risque

| Type de commande | Risque | HITL |
|-----------------|--------|------|
| `ls`, `pwd`, `cat` (lecture) | 0.0 | Non |
| `git status`, `npm test` | 0.2 | Non |
| `npm install`, `pip install` | 0.5 | Dépend seuil |
| `rm`, `chmod`, `sudo` | 0.9 | Oui |
| `rm -rf /` | Bloqué par sandbox | — |

## Étapes

1. Évaluer le niveau de risque de la commande
2. Si risque ≥ hitl_threshold : demander confirmation via HITL
3. Exécuter via `terminal.safe` (commandes sûres) ou `terminal.run`
4. Retourner stdout + stderr + exit code

## Exemples

- "Lance npm test"
- "Donne-moi la liste des processus sur le port 3000"
- "Installe la dépendance axios"

## Limitations

- Sandbox bloquant : `rm -rf /`, fork bombs, patterns dangereux
- Timeout 30s par défaut
- Sortie limitée à 10 000 caractères
