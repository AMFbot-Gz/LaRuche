#!/usr/bin/env bash
# =============================================================================
# scripts/start.sh — Script de démarrage Chimera
# =============================================================================
# Usage :
#   ./scripts/start.sh            → profil full (tous les services)
#   ./scripts/start.sh minimal    → profil minimal (queen + brain + evolution + dashboard)
#   ./scripts/start.sh full       → profil full explicite
#   ./scripts/start.sh down       → arrêt de tous les services
#   ./scripts/start.sh logs       → suivi des logs
# =============================================================================

set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
BOLD="\033[1m"
RESET="\033[0m"

# ── Répertoire racine du projet ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[chimera]${RESET} $*"; }
success() { echo -e "${GREEN}[chimera]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[chimera]${RESET} $*"; }
error()   { echo -e "${RED}[chimera] ERREUR${RESET} $*"; exit 1; }

# ── Vérification prérequis ────────────────────────────────────────────────────
check_dependencies() {
  command -v docker >/dev/null 2>&1 || error "docker non trouvé. Installez Docker : https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || error "docker compose (plugin) non trouvé. Mettez à jour Docker Desktop ou installez le plugin."
}

# ── Fichier .env ──────────────────────────────────────────────────────────────
ensure_env() {
  if [ ! -f "$PROJECT_ROOT/.env" ]; then
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
      warn ".env absent — copie automatique depuis .env.example"
      cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
      warn "Pensez à renseigner vos clés dans .env (CHIMERA_SECRET, ANTHROPIC_API_KEY…)"
    else
      error ".env et .env.example absents. Impossible de démarrer."
    fi
  fi
}

# ── Affichage des URLs après démarrage ────────────────────────────────────────
print_urls() {
  local profile="$1"

  # Lire les ports depuis .env (avec valeurs par défaut)
  local queen_port="${QUEEN_PORT:-3000}"
  local dashboard_port="${DASHBOARD_PORT:-3001}"
  local brain_port="${AGENT_BRAIN_PORT:-8003}"
  local evolution_port="${AGENT_EVOLUTION_PORT:-8005}"

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  Chimera OS — profil : ${CYAN}${profile}${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  Queen      ${GREEN}http://localhost:${queen_port}${RESET}"
  echo -e "  Dashboard  ${GREEN}http://localhost:${dashboard_port}${RESET}"
  echo -e "  Brain      ${GREEN}http://localhost:${brain_port}/health${RESET}"
  echo -e "  Evolution  ${GREEN}http://localhost:${evolution_port}/health${RESET}"

  if [ "$profile" = "full" ]; then
    local orch_port="${AGENT_ORCHESTRATION_PORT:-8001}"
    local perc_port="${AGENT_PERCEPTION_PORT:-8002}"
    local exec_port="${AGENT_EXECUTOR_PORT:-8004}"
    local mem_port="${AGENT_MEMORY_PORT:-8006}"
    local mcp_port="${AGENT_MCP_BRIDGE_PORT:-8007}"
    local gateway_port="${GATEWAY_PORT:-8100}"
    echo -e "  Orchestration  ${CYAN}http://localhost:${orch_port}/health${RESET}"
    echo -e "  Perception     ${CYAN}http://localhost:${perc_port}/health${RESET}"
    echo -e "  Executor       ${CYAN}http://localhost:${exec_port}/health${RESET}"
    echo -e "  Memory         ${CYAN}http://localhost:${mem_port}/health${RESET}"
    echo -e "  MCP Bridge     ${CYAN}http://localhost:${mcp_port}/health${RESET}"
    echo -e "  Voice          ${CYAN}http://localhost:8010/health${RESET}"
    echo -e "  Gateway        ${CYAN}http://localhost:${gateway_port}/health${RESET}"
    echo -e "  ChromaDB       ${CYAN}http://localhost:8200${RESET}"
    echo -e "  Ollama         ${CYAN}http://localhost:11434${RESET}"
    echo -e "  Redis          ${CYAN}redis://localhost:6379${RESET}"
  fi

  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo -e "  Logs   : ${YELLOW}docker compose logs -f${RESET}"
  echo -e "  Stop   : ${YELLOW}./scripts/start.sh down${RESET}"
  echo ""
}

# ── Commande principale ───────────────────────────────────────────────────────
main() {
  local cmd="${1:-full}"

  check_dependencies

  # Charger .env pour lire les ports dans print_urls
  if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
  fi

  case "$cmd" in

    down)
      info "Arrêt de tous les services Chimera..."
      docker compose down
      success "Services arrêtés."
      ;;

    logs)
      docker compose logs -f
      ;;

    minimal)
      ensure_env
      info "Démarrage profil ${BOLD}minimal${RESET} (queen + brain + evolution + dashboard + chromadb)..."
      docker compose --profile minimal up -d --build
      success "Services minimal démarrés."
      print_urls "minimal"
      ;;

    full)
      ensure_env
      info "Démarrage profil ${BOLD}full${RESET} (tous les services)..."
      docker compose --profile full up -d --build
      success "Tous les services démarrés."
      print_urls "full"
      ;;

    *)
      echo "Usage : $0 [minimal|full|down|logs]"
      echo ""
      echo "  minimal  — queen + brain + evolution + dashboard + chromadb"
      echo "  full     — tous les services (défaut)"
      echo "  down     — arrêter tous les services"
      echo "  logs     — suivre les logs en direct"
      exit 1
      ;;
  esac
}

main "$@"
