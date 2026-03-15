---
name: Agent Request
about: Demander la création d'un nouvel agent Chimera (spécifique au projet)
title: "feat(agent): nouvel agent <nom>"
labels: ["new-agent", "enhancement", "triage"]
assignees: []
---

## Nom et rôle de l'agent

- **Nom proposé :** `<nom>` (ex : `scheduler`, `tester`, `deployer`)
- **Port proposé :** `:80XX` (vérifier disponibilité dans le Makefile)
- **Rôle en une phrase :** ...

## Problème que cet agent résout

<!-- Quelle capacité manque aujourd'hui à Chimera que cet agent apporterait ?
     Ex : "Chimera ne peut pas planifier des tâches différées dans le temps.
           Un agent scheduler permettrait de..." -->

## Fonctionnalités attendues

<!-- Liste des endpoints FastAPI minimaux que l'agent doit exposer.
     Les endpoints /health et /status sont OBLIGATOIRES pour tous les agents. -->

- [ ] `GET /health` — vérification d'état (obligatoire)
- [ ] `GET /status` — métriques de l'agent (obligatoire)
- [ ] `POST /...` — ...
- [ ] `POST /...` — ...

## Données en entrée / sortie

```python
# Schéma d'entrée (Pydantic)
class MyRequest(BaseModel):
    ...

# Schéma de sortie (Pydantic)
class MyResponse(BaseModel):
    ...
```

## Dépendances

<!-- Librairies Python nécessaires (ajoutées au pyproject.toml de l'agent). -->

- `librairie-python>=x.y`
- ...

## Interactions avec les autres agents

<!-- Cet agent doit-il appeler ou être appelé par d'autres agents ?
     Ex : "Appelle Brain (/think) pour planifier, envoie le résultat à Executor (/run)" -->

| Agent | Direction | Endpoint | Raison |
|-------|-----------|----------|--------|
| brain | → (appelle) | `POST /think` | Planification LLM |
| ... | | | |

## Modèle LLM requis

<!-- Cet agent a-t-il besoin d'un LLM ? Si oui, lequel est recommandé ?
     Options disponibles : llama3.2:3b, qwen2.5-coder:32b, deepseek-r1, claude-3-5-sonnet -->

- [ ] Sans LLM (logique pure)
- [ ] LLM léger (llama3.2:3b)
- [ ] LLM code (qwen2.5-coder:32b)
- [ ] LLM raisonnement (deepseek-r1)
- [ ] LLM cloud (Claude — si offline impossible)

## Critères d'acceptation

<!-- Qu'est-ce qui doit être vrai pour que cette issue soit considérée DONE ? -->

- [ ] Agent démarre avec `uvicorn agents.<nom>.<nom>_agent:app --port 80XX`
- [ ] `GET /health` retourne `{"status": "healthy"}`
- [ ] Au moins 10 tests unitaires passent
- [ ] `pyproject.toml` propre avec `uv` workspace
- [ ] Ajout dans le `Makefile` (`make start`, `make status`)
- [ ] Ajout dans `docker-compose.yml`
- [ ] Documentation dans `agents/<nom>/README.md` (optionnel mais apprécié)

## Checklist avant soumission

- [ ] J'ai lu [`AGENT_PATTERN.md`](../../agents/evolution/AGENT_PATTERN.md)
- [ ] J'ai vérifié qu'aucun agent existant ne couvre déjà ce besoin
- [ ] Le port proposé n'est pas déjà utilisé (vérifier le `Makefile`)
- [ ] J'ai considéré la sécurité (pas d'exécution arbitraire, validation des inputs)
