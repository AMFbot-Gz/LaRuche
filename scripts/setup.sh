#!/usr/bin/env bash
# =============================================================================
# Chimera OS — Script de setup initial
# Usage : bash scripts/setup.sh
# =============================================================================

set -euo pipefail

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────────────────────
ok()   { echo -e "  ${GREEN}✓${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "  ${RED}✗${NC}  $*"; }
info() { echo -e "  ${BLUE}→${NC}  $*"; }
section() { echo -e "\n${BOLD}$*${NC}"; }

# ─── Répertoire racine ───────────────────────────────────────────────────────
# Le script peut être lancé depuis n'importe où
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║        🐝  Chimera OS — Setup         ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# =============================================================================
# 1. VÉRIFICATION DES PRÉREQUIS
# =============================================================================
section "1/4 — Vérification des prérequis"

PREREQ_OK=true

# Node.js >= 20
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "node v${NODE_VERSION}"
  else
    err "node v${NODE_VERSION} — requis : >=20  (https://nodejs.org)"
    PREREQ_OK=false
  fi
else
  err "node NON TROUVÉ — requis : >=20  (https://nodejs.org)"
  PREREQ_OK=false
fi

# pnpm
if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm --version)"
else
  err "pnpm NON TROUVÉ — installez avec : npm install -g pnpm"
  PREREQ_OK=false
fi

# Python 3.11+
if command -v python3 >/dev/null 2>&1; then
  PY_VERSION=$(python3 --version | awk '{print $2}')
  PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
  PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
  if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 11 ]; then
    ok "python3 ${PY_VERSION}"
  else
    err "python3 ${PY_VERSION} — requis : >=3.11  (https://python.org)"
    PREREQ_OK=false
  fi
else
  err "python3 NON TROUVÉ — requis : >=3.11"
  PREREQ_OK=false
fi

# uv
if command -v uv >/dev/null 2>&1; then
  ok "uv $(uv --version)"
else
  err "uv NON TROUVÉ — installez avec : curl -LsSf https://astral.sh/uv/install.sh | sh"
  PREREQ_OK=false
fi

# Ollama (optionnel)
if command -v ollama >/dev/null 2>&1; then
  ok "ollama $(ollama --version 2>/dev/null | head -1 || echo 'installé')"
else
  warn "ollama NON TROUVÉ (optionnel — requis pour ROUTING_MODE=local_only)"
  info  "Installez avec : curl -fsSL https://ollama.com/install.sh | sh"
fi

if [ "$PREREQ_OK" = false ]; then
  echo ""
  err "Des prérequis obligatoires sont manquants. Installez-les puis relancez ce script."
  exit 1
fi

# =============================================================================
# 2. COPIE DU .env
# =============================================================================
section "2/4 — Configuration .env"

if [ ! -f ".env" ]; then
  cp .env.example .env
  ok ".env créé depuis .env.example"
  warn "Pensez à renseigner ANTHROPIC_API_KEY et CHIMERA_SECRET dans .env"
else
  ok ".env déjà présent"
fi

# =============================================================================
# 3. INSTALLATION DES DÉPENDANCES
# =============================================================================
section "3/4 — Installation des dépendances"

# Node.js — pnpm install
info "pnpm install (workspace complet)..."
pnpm install
ok "Dépendances Node.js installées"

# Python — uv sync (workspace uv défini dans pyproject.toml racine)
info "uv sync (workspace Python — 9 agents)..."
uv sync
ok "Dépendances Python installées"

# Tesseract (optionnel, requis pour l'agent perception OCR)
if ! command -v tesseract >/dev/null 2>&1; then
  warn "tesseract NON TROUVÉ (optionnel — requis pour OCR dans l'agent perception)"
  if [ "$(uname)" = "Darwin" ]; then
    info "Sur macOS : brew install tesseract"
  elif command -v apt-get >/dev/null 2>&1; then
    info "Sur Ubuntu/Debian : sudo apt-get install -y tesseract-ocr"
  fi
else
  ok "tesseract $(tesseract --version 2>&1 | head -1)"
fi

# =============================================================================
# 4. SUCCÈS
# =============================================================================
section "4/4 — Setup terminé !"

echo ""
echo -e "  ${GREEN}${BOLD}✅ Chimera OS est prêt.${NC}"
echo ""
echo -e "  ${BOLD}Commandes disponibles :${NC}"
echo -e "    ${BLUE}make dev${NC}           → Lance Queen + Dashboard + 9 agents"
echo -e "    ${BLUE}make agents${NC}        → Lance uniquement les 9 agents Python"
echo -e "    ${BLUE}make test${NC}          → Lance tous les tests"
echo -e "    ${BLUE}make help${NC}          → Affiche toutes les commandes"
echo ""
echo -e "  ${BOLD}URLs une fois démarré :${NC}"
echo -e "    ${BLUE}http://localhost:3000${NC}   Queen Node.js"
echo -e "    ${BLUE}http://localhost:3001${NC}   Dashboard Next.js"
echo -e "    ${BLUE}http://localhost:8001${NC}   Agent Orchestration"
echo -e "    ${BLUE}http://localhost:8002${NC}   Agent Perception"
echo -e "    ${BLUE}http://localhost:8003${NC}   Agent Brain"
echo -e "    ${BLUE}http://localhost:8004${NC}   Agent Executor"
echo -e "    ${BLUE}http://localhost:8005${NC}   Agent Evolution"
echo -e "    ${BLUE}http://localhost:8006${NC}   Agent Memory"
echo -e "    ${BLUE}http://localhost:8007${NC}   Agent MCP Bridge"
echo -e "    ${BLUE}http://localhost:8008${NC}   Agent Discovery"
echo -e "    ${BLUE}http://localhost:8009${NC}   Agent Knowledge"
echo ""
