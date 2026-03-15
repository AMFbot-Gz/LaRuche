# Load .env if it exists
-include .env
export

.PHONY: install install-ollama dev queen dashboard \
        agents agents-up agents-down agents-status stop-agents logs logs-agents \
        build build-queen build-dashboard \
        test test-python test-node test-queen test-watch \
        docker-up docker-down docker-logs docker-reset \
        migrate db-migrate clean lint type-check status \
        doctor setup help

# ── Variables ───────────────────────────────────────────────────────────────
PYTHON := python3
UV     := uv
PNPM   := pnpm

AGENT_LOG_DIR := /tmp/chimera_agents_logs
AGENT_PID_FILE := /tmp/chimera_agents.pids

# ── Setup ───────────────────────────────────────────────────────────────────

setup: ## Premier lancement : install + copie .env + doctor
	@echo "🔧 Chimera setup..."
	@cp -n .env.example .env 2>/dev/null && echo "  ✓ .env créé depuis .env.example" || echo "  - .env déjà présent"
	$(MAKE) install
	$(MAKE) doctor
	@echo ""
	@echo "✅ Setup terminé ! Démarrez avec : make dev"
	@echo "   Queen:     http://localhost:3000"
	@echo "   Dashboard: http://localhost:3001"
	@echo "   Agents:    http://localhost:8001-8009"

doctor: ## Vérifie les prérequis (node, pnpm, python3, uv, ollama)
	@echo "=== Chimera Doctor ==="
	@node --version >/dev/null 2>&1 && echo "  ✅ node       $$(node --version)" || echo "  ❌ node       NON TROUVÉ (requis : >=20)"
	@pnpm --version >/dev/null 2>&1 && echo "  ✅ pnpm       $$(pnpm --version)" || echo "  ❌ pnpm       NON TROUVÉ (requis : >=9)"
	@python3 --version >/dev/null 2>&1 && echo "  ✅ python3    $$(python3 --version)" || echo "  ❌ python3    NON TROUVÉ (requis : >=3.11)"
	@uv --version >/dev/null 2>&1 && echo "  ✅ uv         $$(uv --version)" || echo "  ❌ uv         NON TROUVÉ — https://docs.astral.sh/uv/"
	@ollama --version >/dev/null 2>&1 && echo "  ✅ ollama     $$(ollama --version 2>/dev/null | head -1)" || echo "  ⚠️  ollama     NON TROUVÉ (optionnel, requis pour mode local)"
	@tesseract --version >/dev/null 2>&1 && echo "  ✅ tesseract  $$(tesseract --version 2>&1 | head -1)" || echo "  ⚠️  tesseract  NON TROUVÉ (optionnel, requis pour perception OCR)"
	@echo "=============================="

install: ## Installe toutes les dépendances (Node.js + Python + tesseract)
	@echo "📦 Installation Node.js (pnpm)..."
	$(PNPM) install
	@echo "🐍 Installation Python (uv)..."
	$(UV) sync
	@echo "🔍 Vérification de tesseract..."
	@if ! command -v tesseract >/dev/null 2>&1; then \
		echo "⚠️  tesseract non trouvé — installation..."; \
		if [ "$$(uname)" = "Darwin" ]; then \
			brew install tesseract; \
		elif command -v apt-get >/dev/null 2>&1; then \
			sudo apt-get install -y tesseract-ocr; \
		else \
			echo "❌ Installez tesseract manuellement : https://github.com/tesseract-ocr/tesseract"; \
		fi \
	else \
		echo "✅ tesseract déjà installé : $$(tesseract --version 2>&1 | head -1)"; \
	fi
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
	@echo "✅ Chimera running — Queen :3000 · Dashboard :3001 · Agents :8001-8009"

queen: ## Lance seulement la Queen Node.js
	cd apps/queen && node src/queen_oss.js

dashboard: ## Lance seulement le dashboard
	cd apps/dashboard && $(PNPM) dev

agents: agents-up ## Alias → agents-up (lance les 9 agents Python en background)

agents-up: ## Lance les 9 agents Python (avec PIDs dans /tmp/chimera_agents.pids)
	@echo "🐝 Démarrage des agents Python..."
	@mkdir -p $(AGENT_LOG_DIR)
	@rm -f $(AGENT_PID_FILE)
	@touch $(AGENT_PID_FILE)
	@PORT=$${AGENT_ORCHESTRATION_PORT:-8001}; \
		$(UV) run uvicorn agents.orchestration.orchestration_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/orchestration.log 2>&1 & \
		echo "$$! orchestration" >> $(AGENT_PID_FILE); \
		echo "  ✓ orchestration   :$$PORT (PID $$!)"
	@PORT=$${AGENT_PERCEPTION_PORT:-8002}; \
		$(UV) run uvicorn agents.perception.perception_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/perception.log 2>&1 & \
		echo "$$! perception" >> $(AGENT_PID_FILE); \
		echo "  ✓ perception      :$$PORT (PID $$!)"
	@PORT=$${AGENT_BRAIN_PORT:-8003}; \
		$(UV) run uvicorn agents.brain.brain:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/brain.log 2>&1 & \
		echo "$$! brain" >> $(AGENT_PID_FILE); \
		echo "  ✓ brain           :$$PORT (PID $$!)"
	@PORT=$${AGENT_EXECUTOR_PORT:-8004}; \
		$(UV) run uvicorn agents.executor.executor_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/executor.log 2>&1 & \
		echo "$$! executor" >> $(AGENT_PID_FILE); \
		echo "  ✓ executor        :$$PORT (PID $$!)"
	@PORT=$${AGENT_EVOLUTION_PORT:-8005}; \
		$(UV) run uvicorn agents.evolution.auto_coder_bee:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/evolution.log 2>&1 & \
		echo "$$! evolution" >> $(AGENT_PID_FILE); \
		echo "  ✓ evolution       :$$PORT (PID $$!)"
	@PORT=$${AGENT_MEMORY_PORT:-8006}; \
		$(UV) run uvicorn agents.memory.memory_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/memory.log 2>&1 & \
		echo "$$! memory" >> $(AGENT_PID_FILE); \
		echo "  ✓ memory          :$$PORT (PID $$!)"
	@PORT=$${AGENT_MCP_BRIDGE_PORT:-8007}; \
		(cd agents/mcp-bridge && $(UV) run uvicorn mcp_bridge_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/mcp-bridge.log 2>&1) & \
		echo "$$! mcp-bridge" >> $(AGENT_PID_FILE); \
		echo "  ✓ mcp-bridge      :$$PORT (PID $$!)"
	@PORT=$${AGENT_DISCOVERY_PORT:-8008}; \
		$(UV) run uvicorn agents.discovery.mapper_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/discovery.log 2>&1 & \
		echo "$$! discovery" >> $(AGENT_PID_FILE); \
		echo "  ✓ discovery       :$$PORT (PID $$!)"
	@PORT=$${AGENT_KNOWLEDGE_PORT:-8009}; \
		$(UV) run uvicorn agents.knowledge.librarian_agent:app \
			--host 0.0.0.0 --port $$PORT \
			>$(AGENT_LOG_DIR)/knowledge.log 2>&1 & \
		echo "$$! knowledge" >> $(AGENT_PID_FILE); \
		echo "  ✓ knowledge       :$$PORT (PID $$!)"
	@echo "✅ 9 agents Python démarrés — PIDs dans $(AGENT_PID_FILE)"
	@echo "   Logs : $(AGENT_LOG_DIR)/"

stop-agents: agents-down ## Alias → agents-down (arrête les agents Python)

agents-down: ## Arrête tous les agents Python (via PID file)
	@if [ -f $(AGENT_PID_FILE) ]; then \
		echo "🛑 Arrêt des agents Python..."; \
		while IFS=' ' read -r pid name; do \
			if [ -n "$$pid" ] && kill -0 "$$pid" 2>/dev/null; then \
				kill "$$pid" && echo "  ✓ $$name (PID $$pid) arrêté"; \
			else \
				echo "  - $$name (PID $$pid) déjà arrêté"; \
			fi; \
		done < $(AGENT_PID_FILE); \
		rm -f $(AGENT_PID_FILE); \
		echo "✅ Agents Python arrêtés"; \
	else \
		echo "ℹ️  Aucun PID file trouvé ($(AGENT_PID_FILE)) — agents peut-être déjà arrêtés"; \
	fi

agents-status: ## Vérifie l'état de santé de chaque agent Python
	@echo "=== État des agents Chimera ==="
	@check_agent() { \
		name=$$1; port=$$2; \
		result=$$(curl -s --max-time 2 http://localhost:$$port/health 2>/dev/null); \
		if [ -n "$$result" ]; then \
			echo "  ✅ $$name    :$$port — UP"; \
		else \
			echo "  ❌ $$name    :$$port — DOWN"; \
		fi; \
	}; \
	check_agent orchestration $${AGENT_ORCHESTRATION_PORT:-8001}; \
	check_agent perception    $${AGENT_PERCEPTION_PORT:-8002}; \
	check_agent brain         $${AGENT_BRAIN_PORT:-8003}; \
	check_agent executor      $${AGENT_EXECUTOR_PORT:-8004}; \
	check_agent evolution     $${AGENT_EVOLUTION_PORT:-8005}; \
	check_agent memory        $${AGENT_MEMORY_PORT:-8006}; \
	check_agent mcp-bridge    $${AGENT_MCP_BRIDGE_PORT:-8007}; \
	check_agent discovery     $${AGENT_DISCOVERY_PORT:-8008}; \
	check_agent knowledge     $${AGENT_KNOWLEDGE_PORT:-8009}

logs-agents: logs ## Alias → logs (tail des logs agents Python)

logs: ## Affiche les logs de tous les agents (tail -f)
	@echo "📋 Logs des agents Python ($(AGENT_LOG_DIR)/) — Ctrl+C pour quitter"
	@if ls $(AGENT_LOG_DIR)/*.log >/dev/null 2>&1; then \
		tail -f $(AGENT_LOG_DIR)/*.log; \
	else \
		echo "❌ Aucun log trouvé dans $(AGENT_LOG_DIR)/ — agents démarrés ?"; \
	fi

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
	$(UV) run pytest agents/ apps/ -v --tb=short

test-node: ## Lance les tests Node.js uniquement (tous les packages pnpm)
	@echo "🧪 Tests Node.js..."
	$(PNPM) turbo run test

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

db-migrate: ## Lance les migrations Prisma (@chimera/db)
	@echo "🗄️  Migration base de données..."
	$(PNPM) --filter @chimera/db db:migrate
	@echo "✅ Migration terminée"

migrate: ## Migre les projets existants vers chimera/
	@echo "🔄 Migration des projets existants..."
	bash infra/scripts/migrate.sh

# ── Utilitaires ──────────────────────────────────────────────────────────────

clean: ## Nettoie les artefacts de build (.next, dist, __pycache__)
	$(PNPM) turbo run clean
	find . -name '__pycache__' -exec rm -rf {} + 2>/dev/null; true
	find . -name '*.pyc' -delete 2>/dev/null; true
	find . -name '.next' -not -path '*/node_modules/*' -exec rm -rf {} + 2>/dev/null; true
	find . -name 'dist' -not -path '*/node_modules/*' -exec rm -rf {} + 2>/dev/null; true
	@echo "✅ Nettoyé"

lint: ## Linte tout le code (ESLint + black + flake8)
	$(PNPM) turbo run lint
	@echo "🐍 Lint Python (black --check)..."
	$(UV) run black --check agents/ apps/ packages/ 2>/dev/null || true
	@echo "🐍 Lint Python (flake8)..."
	$(UV) run flake8 agents/ apps/ packages/ 2>/dev/null || true

type-check: ## Vérifie les types TypeScript
	$(PNPM) turbo run type-check

status: ## Affiche l'état de tous les services
	@echo "=== Chimera Status ==="
	@curl -s --max-time 2 http://localhost:3000/api/health 2>/dev/null && echo "✅ Queen :3000" || echo "❌ Queen :3000"
	$(MAKE) agents-status

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
