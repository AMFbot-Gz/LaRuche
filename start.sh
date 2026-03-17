#!/usr/bin/env bash
# start.sh — La Ruche / Chimera — Script de démarrage complet
# Usage : bash start.sh  ou  ./start.sh

set -euo pipefail

# ─── Couleurs ANSI ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

ok()    { echo -e "${GREEN}  [OK]${NC}    $*"; }
fail()  { echo -e "${RED}  [FAIL]${NC}  $*"; }
warn()  { echo -e "${YELLOW}  [WARN]${NC}  $*"; }
info()  { echo -e "${BLUE}  [INFO]${NC}  $*"; }
step()  { echo -e "\n${CYAN}${BOLD}━━━  $*  ━━━${NC}"; }

# ─── Logo ASCII La Ruche ───────────────────────────────────────────────────────
echo -e "${YELLOW}${BOLD}"
cat << 'BANNER'
  ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗
  ██╔══██╗██║   ██║██╔════╝██║  ██║██╔════╝
  ██████╔╝██║   ██║██║     ███████║█████╗
  ██╔══██╗██║   ██║██║     ██╔══██║██╔══╝
  ██║  ██║╚██████╔╝╚██████╗██║  ██║███████╗
  ╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝

  La Ruche — OS Agentique IA  ·  Démarrage
BANNER
echo -e "${NC}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp/chimera_agents_logs"
START_TIME=$(date +%s)

# ─── Vérifications préalables ──────────────────────────────────────────────────
step "Vérifications préalables"

# .env
if [ ! -f "$REPO_DIR/.env" ]; then
  if [ -f "$REPO_DIR/.env.example" ]; then
    cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
    warn ".env créé depuis .env.example — pensez à le configurer"
  else
    fail ".env introuvable — lancez d'abord : bash install.sh"
    exit 1
  fi
else
  ok ".env présent"
fi

# Ollama
if command -v ollama &>/dev/null; then
  if curl -sf http://localhost:11434/api/tags &>/dev/null; then
    ok "Ollama en ligne (:11434)"
  else
    warn "Ollama installé mais server non actif"
    info "Démarrez Ollama en arrière-plan : ollama serve &"
  fi
else
  warn "Ollama non trouvé — mode LLM local désactivé"
fi

# Redis
REDIS_OK=false
if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
  ok "Redis en ligne (:6379)"
  REDIS_OK=true
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q redis; then
    ok "Redis container Docker déjà actif"
    REDIS_OK=true
  else
    info "Démarrage Redis via Docker..."
    if docker run -d --name chimera-redis -p 6379:6379 --restart=unless-stopped redis:7-alpine &>/dev/null 2>&1; then
      ok "Redis container démarré"
      REDIS_OK=true
    else
      warn "Impossible de démarrer Redis — continuons sans"
    fi
  fi
else
  warn "Redis non disponible (pas de redis-cli ni Docker)"
fi

# Dépendances node_modules
if [ ! -d "$REPO_DIR/node_modules" ]; then
  warn "node_modules absent — lancez : pnpm install"
fi

# ─── Dossiers de logs ──────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ─── Démarrage Queen (Node.js) ─────────────────────────────────────────────────
step "Démarrage Queen (Node.js)"

QUEEN_PID_FILE="/tmp/chimera_queen.pid"
QUEEN_JS="$REPO_DIR/apps/queen/src/queen_oss.js"
QUEEN_LOG="$LOG_DIR/queen.log"

if [ -f "$QUEEN_PID_FILE" ]; then
  EXISTING_PID=$(cat "$QUEEN_PID_FILE")
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    ok "Queen déjà en cours (PID $EXISTING_PID)"
  else
    rm -f "$QUEEN_PID_FILE"
  fi
fi

if [ ! -f "$QUEEN_PID_FILE" ]; then
  if [ -f "$QUEEN_JS" ]; then
    node "$QUEEN_JS" > "$QUEEN_LOG" 2>&1 &
    QUEEN_PID=$!
    echo "$QUEEN_PID" > "$QUEEN_PID_FILE"
    ok "Queen démarrée (PID $QUEEN_PID) — log : $QUEEN_LOG"
  else
    warn "queen_oss.js introuvable : $QUEEN_JS"
    info "Tentative avec make queen..."
    (cd "$REPO_DIR" && make queen > "$QUEEN_LOG" 2>&1 &)
    ok "Queen lancée via make queen — log : $QUEEN_LOG"
  fi
fi

# ─── Démarrage des 9 agents Python ─────────────────────────────────────────────
step "Démarrage des 9 agents Python"
cd "$REPO_DIR"
make agents-up
ok "Agents Python démarrés"

# ─── Démarrage Dashboard (Next.js) ─────────────────────────────────────────────
step "Démarrage Dashboard (Next.js)"

DASH_PID_FILE="/tmp/chimera_dashboard.pid"
DASH_DIR="$REPO_DIR/apps/dashboard"
DASH_LOG="$LOG_DIR/dashboard.log"

if [ -f "$DASH_PID_FILE" ]; then
  EXISTING_PID=$(cat "$DASH_PID_FILE")
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    ok "Dashboard déjà en cours (PID $EXISTING_PID)"
  else
    rm -f "$DASH_PID_FILE"
  fi
fi

if [ ! -f "$DASH_PID_FILE" ]; then
  if [ -d "$DASH_DIR" ]; then
    (cd "$DASH_DIR" && pnpm dev > "$DASH_LOG" 2>&1) &
    DASH_PID=$!
    echo "$DASH_PID" > "$DASH_PID_FILE"
    ok "Dashboard démarré (PID $DASH_PID) — log : $DASH_LOG"
  else
    warn "apps/dashboard introuvable"
  fi
fi

# ─── Attente et vérification santé ─────────────────────────────────────────────
step "Vérification de santé (attente 5s...)"
sleep 5

QUEEN_UP=false
DASH_UP=false
AGENTS_UP=0

if curl -sf --connect-timeout 3 http://localhost:3000/api/health &>/dev/null || \
   curl -sf --connect-timeout 3 http://localhost:3000 &>/dev/null; then
  ok "Queen répond sur :3000"
  QUEEN_UP=true
else
  warn "Queen pas encore prête (démarrage en cours...)"
fi

if curl -sf --connect-timeout 3 http://localhost:3001 &>/dev/null; then
  ok "Dashboard répond sur :3001"
  DASH_UP=true
else
  warn "Dashboard pas encore prêt (Next.js démarre...)"
fi

for port in 8001 8002 8003 8004 8005 8006 8007 8008 8009; do
  if curl -sf --connect-timeout 2 "http://localhost:${port}/health" &>/dev/null; then
    AGENTS_UP=$((AGENTS_UP + 1))
  fi
done

# ─── Calcul durée ──────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_FMT="$((DURATION / 60))m $((DURATION % 60))s"

# ─── Tableau résumé final ──────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║          La Ruche — Tableau de bord                         ║${NC}"
echo -e "${CYAN}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"

QUEEN_STATUS="${RED}DOWN${NC}"
[ "$QUEEN_UP" = true ] && QUEEN_STATUS="${GREEN}UP${NC}  "
echo -e "${CYAN}║${NC}  Queen API     ${QUEEN_STATUS}  ${CYAN}http://localhost:3000${NC}                  ${CYAN}║${NC}"

DASH_STATUS="${YELLOW}DEMARRAGE${NC}"
[ "$DASH_UP" = true ] && DASH_STATUS="${GREEN}UP${NC}       "
echo -e "${CYAN}║${NC}  Dashboard     ${DASH_STATUS}  ${CYAN}http://localhost:3001${NC}                  ${CYAN}║${NC}"

echo -e "${CYAN}║${NC}  Agents        ${GREEN}${AGENTS_UP}/9${NC}       ${CYAN}http://localhost:8001-8009${NC}              ${CYAN}║${NC}"

REDIS_STATUS="${YELLOW}DOWN${NC}"
[ "$REDIS_OK" = true ] && REDIS_STATUS="${GREEN}UP${NC}  "
echo -e "${CYAN}║${NC}  Redis         ${REDIS_STATUS}  localhost:6379                         ${CYAN}║${NC}"

echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  Logs          ${DIM}/tmp/chimera_agents_logs/${NC}                   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Durée         ${DIM}${DURATION_FMT}${NC}                                       ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Commandes utiles${NC}                                             ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${CYAN}./ruche status${NC}   — état en temps réel                      ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${CYAN}./ruche logs${NC}     — logs (tous les services)                 ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${CYAN}./ruche stop${NC}     — arrêter tous les services                ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${CYAN}./ruche health${NC}   — diagnostic complet                       ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
