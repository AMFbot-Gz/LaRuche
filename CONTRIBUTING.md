# Contributing to Chimera / LaRuche

Bienvenue dans Chimera ! Ce guide t'explique comment contribuer au projet, que ce soit pour corriger un bug, proposer une feature, ou créer un nouvel agent.

---

## Prérequis

| Outil | Version minimale | Rôle |
|-------|-----------------|------|
| Node.js | 20+ | Queen, Dashboard Next.js |
| pnpm | 9+ | Gestionnaire de paquets JS |
| Python | 3.11+ | Tous les agents |
| uv | 0.4+ | Gestionnaire de paquets Python |
| Ollama | Latest | LLM local (llama3.2, qwen2.5-coder, deepseek-r1) |
| Docker | 24+ | Déploiement local complet (optionnel) |

```bash
# Vérifier les versions
node --version    # >= 20
pnpm --version    # >= 9
python3 --version # >= 3.11
uv --version      # >= 0.4
ollama --version
```

---

## Setup du projet

```bash
# 1. Cloner le dépôt
git clone https://github.com/AMFbot-Gz/LaRuche.git
cd LaRuche

# 2. Installer toutes les dépendances (JS + Python) et configurer l'environnement
make setup

# 3. Copier et remplir les variables d'environnement
cp .env.example .env
# Éditer .env avec tes clés (CLERK_SECRET_KEY, STRIPE_SECRET_KEY, etc.)

# 4. Lancer Chimera en mode développement
make start

# 5. Vérifier que tout tourne
make status
```

Après `make start`, les services sont disponibles sur :
- Queen : http://localhost:3000
- Dashboard : http://localhost:3001
- Agents Python : http://localhost:8001–8010

---

## Lancer les tests

```bash
# Tous les tests (Python + Node.js)
make test

# Tests Python uniquement
uv run pytest

# Tests Python d'un agent spécifique
uv run pytest agents/brain/tests/

# Tests Node.js uniquement
pnpm turbo test

# Tests + couverture
uv run pytest --cov=agents --cov-report=term-missing
```

Les tests doivent passer à 100% avant toute PR. La CI bloque sur un test cassé.

---

## Convention de commits

Chimera suit la spécification [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description courte>

[corps optionnel]

[footer optionnel : breaking changes, closes #xxx]
```

### Types

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Maintenance (deps, config, scripts) |
| `docs` | Documentation uniquement |
| `test` | Ajout ou correction de tests |
| `refactor` | Refactoring sans changement de comportement |
| `perf` | Amélioration de performance |
| `ci` | Changements CI/CD |

### Scopes courants

`queen`, `dashboard`, `orchestration`, `perception`, `brain`, `executor`, `evolution`, `memory`, `mcp-bridge`, `discovery`, `knowledge`, `voice`, `sandbox`, `billing`, `auth`, `infra`, `docs`

### Exemples

```
feat(voice): ajout transcription temps réel via faster-whisper
fix(sandbox): corriger l'import lazy pour éviter SIGABRT macOS
chore(deps): mettre à jour ollama-python vers 0.3.3
docs(brain): ajouter docstrings ModelRouterService
test(orchestration): couvrir les cas d'erreur du ReAct planner
```

---

## Créer un nouvel agent

Chimera suit un pattern d'agent standardisé documenté dans [`agents/evolution/AGENT_PATTERN.md`](agents/evolution/AGENT_PATTERN.md).

### Étapes rapides

1. Lire `agents/evolution/AGENT_PATTERN.md` en entier avant de commencer.
2. Créer la structure de répertoires :
   ```
   agents/<nom>/
   ├── __init__.py
   ├── <nom>_agent.py      # FastAPI app, port :80XX
   ├── pyproject.toml
   ├── schemas/
   │   └── <nom>_schemas.py
   ├── services/
   │   └── <nom>_service.py
   └── tests/
       └── test_<nom>_service.py
   ```
3. Respecter la checklist du pattern :
   - [ ] Endpoints `/health` et `/status` obligatoires
   - [ ] Schémas Pydantic stricts (pas de `dict` nu)
   - [ ] Service découplé de FastAPI (testable seul)
   - [ ] Tests unitaires >= 10 cas
   - [ ] `pyproject.toml` avec `uv` workspace
4. Ajouter le port dans le `Makefile` et le `docker-compose.yml`.
5. Ouvrir une PR avec le template `agent_request.md`.

---

## Soumettre une Pull Request

1. **Fork** le dépôt et crée une branche depuis `main` :
   ```bash
   git checkout -b feat/mon-agent-xyz
   ```

2. **Code** ta feature en respectant les standards (types stricts, gestion d'erreurs, tests).

3. **Vérifie** que tout passe en local :
   ```bash
   make test
   pnpm turbo lint
   uv run black --check agents/
   uv run flake8 agents/
   ```

4. **Commite** avec la convention Conventional Commits (voir ci-dessus).

5. **Pousse** et ouvre une PR vers `main` :
   - Utilise le template approprié (bug, feature, agent).
   - Remplis toutes les sections du template.
   - Lie le(s) issue(s) concerné(s) avec `Closes #xxx`.

6. La CI doit passer (lint + tests + build) avant toute review.

7. Un maintainer reviewe sous 72h. Les retours sont constructifs — nous appliquons le Code of Conduct.

---

## Code of Conduct

**Be excellent to each other.**

Chimera est un projet ouvert et bienveillant. Tout le monde est le bienvenu, quelle que soit son expérience ou son background. Les comportements irrespectueux, discriminatoires ou hostiles ne sont pas tolérés et entraîneront une exclusion du projet.

En contribuant, tu acceptes de :
- Traiter chaque contributeur avec respect et bienveillance.
- Accueillir les critiques constructives avec ouverture.
- Te concentrer sur ce qui est le mieux pour la communauté et le projet.
- Signaler tout comportement inacceptable en ouvrant une issue privée ou en contactant les mainteneurs directement.

---

## Questions ?

- Ouvre une [Discussion GitHub](https://github.com/AMFbot-Gz/LaRuche/discussions)
- Consulte la [documentation interne](docs/)
- Lis le [AGENT_PATTERN.md](agents/evolution/AGENT_PATTERN.md) pour tout ce qui concerne les agents

Merci de contribuer à Chimera. Ensemble on construit quelque chose d'utile. 🐝
