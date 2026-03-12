---
name: vault-memory
version: 1.0.0
description: "Stocke et récupère des informations dans la mémoire vectorielle du vault"
tags:
  - memory
  - vault
  - persistence
tools:
  - vault.store
  - vault.search
  - vault.profile
  - vault.rule
gpu_class: light
enabled: true
permissions: []
mcps:
  - mcp-vault
author: laruche-core
keywords:
  - souviens
  - retiens
  - mémorise
  - n'oublie pas
  - remember
  - rappelle-toi
  - qu'est-ce que je t'ai dit
  - tu te souviens
---

## Description

Gère la mémoire persistante de l'assistant via le vault ChromaDB + SQLite.
Permet de stocker des expériences, préférences, règles et de les retrouver
par recherche sémantique.

## Quand utiliser

**Stockage** :
- L'utilisateur demande de se souvenir de quelque chose
- Une information importante émerge de la conversation
- L'utilisateur définit une préférence ou règle

**Récupération** :
- L'utilisateur pose une question sur des informations passées
- Le contexte nécessite des souvenirs antérieurs
- L'utilisateur demande "tu te souviens de..."

## Opérations disponibles

| Opération | Tool | Description |
|-----------|------|-------------|
| Stocker | vault.store | Sauvegarde une expérience avec embedding |
| Rechercher | vault.search | Recherche sémantique dans la mémoire |
| Profil | vault.profile | Récupère le profil complet de l'utilisateur |
| Règle | vault.rule | Ajoute une règle de comportement |

## Exemples

- "Souviens-toi que je préfère TypeScript à JavaScript"
- "N'oublie pas que mon projet principal est LaRuche"
- "Qu'est-ce que je t'ai dit sur mes préférences de code ?"
- "Remember my name is Alex"

## Limitations

- ChromaDB doit être en cours d'exécution
- Recherche sémantique (≠ recherche exacte)
