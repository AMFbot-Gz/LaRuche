.PHONY: install dev build test test-python docker-up docker-down agents-up agents-down migrate clean help

# ── Variables ───────────────────────────────────────────────────────────────
PYTHON := python3
UV     := uv
PNPM   := pnpm

# ── Setup ───────────────────────────────────────────────────────────────────

install: ## Installe toutes les dépendances (Node.js + Python)
	@echo "📦 Installation Node.js (pnpm)..."
	$(PNPM) install
	@echo "🐍 Installation Python (uv)..."
	$(UV) sync
	@echo "✅ Dépendances installées"

install-ollama: ## Installe Ollama + modèles requis
	@echo "🦙 Installation Ollama..."
	curl -fsSL https://ollama.com/install.sh | sh
	@echo "📥 Téléchargement des modèles..."
	ollama pull llama3.2:3b
	ollama pull llava
	ollama pull qwen3-coder
	@echo "✅ Ollama prêt"

# ── Développement ────────────────────────────────────────────────────────────

dev: ## Lance tout en mode développement (Node.js + Python agents)
	@echo "🚀 Démarrage Chimera en mode DEV..."
	$(PNPM) turbo run dev --parallel &
	$(MAKE) agents-up
	@echo "✅ Chimera running — Queen :3000 · Dashboard :3001 · Agents :8001-8007"

queen: ## Lance seulement la Queen Node.js
	cd apps/queen && node src/queen_oss.js

dashboard: ## Lance seulement le dashboard
	cd apps/dashboard && $(PNPM) dev

agents-up: ## Lance les 7 agents Python
	@echo "🐝 Démarrage des agents Python..."
	@for agent in orchestration perception brain executor evolution memory mcp-bridge; do \
		cd agents/$$agent && $(UV) run uvicorn main:app --port $$(grep $$agent ../../../ruche_config.json | grep port | head -1 | grep -o '[0-9]*') --reload & \
		cd ../../..; \
	done
	@echo "✅ Agents Python :8001-:8007 démarrés"

agents-down: ## Arrête tous les agents Python
	@pkill -f "uvicorn main:app" 2>/dev/null || true
	@echo "✅ Agents Python arrêtés"

# ── Build ────────────────────────────────────────────────────────────────────

build: ## Build tous les packages
	$(PNPM) turbo run build

build-queen: ## Build seulement la Queen
	cd apps/queen && $(PNPM) build

build-dashboard: ## Build seulement le dashboard
	cd apps/dashboard && $(PNPM) build

# ── Tests ────────────────────────────────────────────────────────────────────

test: ## Lance tous les tests (Node.js + Python)
	$(PNPM) turbo run test
	$(MAKE) test-python

test-python: ## Lance les tests Python uniquement
	@echo "🧪 Tests Python..."
	$(UV) run pytest agents/ -v --tb=short

test-queen: ## Tests Node.js de la Queen
	cd apps/queen && $(PNPM) test

test-watch: ## Tests en mode watch
	$(PNPM) turbo run test -- --watch

# ── Docker ───────────────────────────────────────────────────────────────────

docker-up: ## Lance toute la stack Docker
	@cp -n .env.example .env 2>/dev/null || true
	docker compose -f infra/docker/docker-compose.yml up -d
	@echo "✅ Stack Docker démarrée"
	@echo "   Queen:     http://localhost:3000"
	@echo "   Dashboard: http://localhost:3001"
	@echo "   Ollama:    http://localhost:11434"
	@echo "   ChromaDB:  http://localhost:8200"

docker-down: ## Arrête la stack Docker
	docker compose -f infra/docker/docker-compose.yml down

docker-logs: ## Affiche les logs Docker
	docker compose -f infra/docker/docker-compose.yml logs -f

docker-reset: ## Reset complet (volumes inclus)
	docker compose -f infra/docker/docker-compose.yml down -v
	@echo "⚠️  Volumes supprimés (ChromaDB, Redis, Ollama)"

# ── Migration ────────────────────────────────────────────────────────────────

migrate: ## Migre les projets existants vers chimera/
	@echo "🔄 Migration des projets existants..."
	bash infra/scripts/migrate.sh

# ── Utilitaires ──────────────────────────────────────────────────────────────

clean: ## Nettoie les artefacts de build
	$(PNPM) turbo run clean
	find . -name '__pycache__' -exec rm -rf {} + 2>/dev/null; true
	find . -name '*.pyc' -delete 2>/dev/null; true
	@echo "✅ Nettoyé"

lint: ## Linte tout le code
	$(PNPM) turbo run lint

type-check: ## Vérifie les types TypeScript
	$(PNPM) turbo run type-check

status: ## Affiche l'état de tous les services
	@echo "=== Chimera Status ==="
	@curl -s http://localhost:3000/api/health 2>/dev/null && echo "✅ Queen :3000" || echo "❌ Queen :3000"
	@for port in 8001 8002 8003 8004 8005 8006 8007; do \
		curl -s http://localhost:$$port/health 2>/dev/null && echo "✅ Agent :$$port" || echo "❌ Agent :$$port"; \
	done

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
