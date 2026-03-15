---
name: Bug Report
about: Signaler un bug ou un comportement inattendu dans Chimera
title: "fix(<scope>): <description courte du bug>"
labels: ["bug", "triage"]
assignees: []
---

## Description du bug

<!-- Décris clairement et concisément ce qui se passe. -->

## Comportement attendu

<!-- Ce qui aurait dû se passer. -->

## Comportement observé

<!-- Ce qui se passe réellement. Inclus les messages d'erreur complets. -->

## Étapes pour reproduire

1. ...
2. ...
3. ...

## Environnement

| Élément | Valeur |
|---------|--------|
| OS | <!-- macOS 15 / Ubuntu 24.04 / ... --> |
| Node.js | <!-- node --version --> |
| Python | <!-- python3 --version --> |
| Chimera commit | <!-- git rev-parse --short HEAD --> |
| Ollama | <!-- ollama --version --> |
| Modèle LLM actif | <!-- llama3.2:3b / qwen2.5-coder:32b / ... --> |

## Logs

<details>
<summary>Logs complets (Queen / agent concerné)</summary>

```
Colle ici les logs pertinents
```

</details>

## Contexte additionnel

<!-- Screenshots, fichiers de config (sans secrets), liens vers des runs CI cassés, etc. -->

## Checklist avant soumission

- [ ] J'ai cherché dans les issues existantes — ce bug n'a pas déjà été reporté
- [ ] J'ai testé sur la dernière version de `main`
- [ ] J'ai inclus les logs complets
- [ ] Je n'ai pas inclus de secrets (API keys, tokens) dans cette issue
