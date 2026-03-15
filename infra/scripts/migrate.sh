#!/usr/bin/env bash
# ============================================================
# Script de migration vers Project Chimera
# Copie (sans déplacer) les composants des projets existants
# vers la structure chimera/
# ============================================================
set -e

CHIMERA_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECTS_DIR="$(cd "$CHIMERA_DIR/.." && pwd)"

log()  { echo -e "\033[36m→ $1\033[0m"; }
ok()   { echo -e "\033[32m✅ $1\033[0m"; }
warn() { echo -e "\033[33m⚠️  $1\033[0m"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Project Chimera — Migration Script     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Queen Node.js depuis PICO-RUCHE ──────────────────────
log "Migration Queen Node.js (PICO-RUCHE → apps/queen)..."
PICO="$PROJECTS_DIR/PICO-RUCHE"
QUEEN="$CHIMERA_DIR/apps/queen"

if [ -d "$PICO" ]; then
  rsync -a --exclude='node_modules' --exclude='.git' --exclude='logs' \
    "$PICO/src/"            "$QUEEN/src/"
  rsync -a \
    "$PICO/package.json"    "$QUEEN/package.json"
  rsync -a \
    "$PICO/ecosystem.config.js" "$QUEEN/" 2>/dev/null || true
  rsync -a --exclude='node_modules' --exclude='.git' \
    "$PICO/mcp_servers/"    "$QUEEN/mcp_servers/" 2>/dev/null || true
  ok "Queen copiée"
else
  warn "PICO-RUCHE non trouvé dans $PICO"
fi

# ── 2. Agents Python depuis PICO-RUCHE ─────────────────────
log "Migration agents Python (PICO-RUCHE → agents/)..."
if [ -d "$PICO/agent" ]; then
  declare -A AGENT_MAP=(
    ["queen"]="orchestration"
    ["perception"]="perception"
    ["brain"]="brain"
    ["executor"]="executor"
    ["evolution"]="evolution"
    ["memory"]="memory"
    ["mcp_bridge"]="mcp-bridge"
  )
  for src_name in "${!AGENT_MAP[@]}"; do
    dst_name="${AGENT_MAP[$src_name]}"
    src="$PICO/agent/$src_name"
    dst="$CHIMERA_DIR/agents/$dst_name"
    if [ -d "$src" ]; then
      rsync -a --exclude='__pycache__' --exclude='*.pyc' \
        "$src/" "$dst/"
      ok "  agent/$dst_name copié"
    fi
  done
fi

# ── 3. Skills core depuis PICO-RUCHE ───────────────────────
log "Migration skills (PICO-RUCHE → skills/core)..."
if [ -d "$PICO/skills" ]; then
  rsync -a --exclude='__pycache__' "$PICO/skills/" "$CHIMERA_DIR/skills/core/"
  ok "Skills core copiés"
fi

# ── 4. NeuralEventBus depuis Ghost OS ──────────────────────
log "Migration NeuralEventBus (ghost-os-ultimate → apps/queen)..."
GHOST="$PROJECTS_DIR/ghost-os-ultimate"
if [ -d "$GHOST/core/consciousness" ]; then
  mkdir -p "$QUEEN/src/core/consciousness"
  rsync -a "$GHOST/core/consciousness/neural_event_bus.js" \
    "$QUEEN/src/core/consciousness/"
  ok "NeuralEventBus migré"
fi

# ── 5. Consciousness depuis Ghost OS ───────────────────────
log "Migration consciousness layer (ghost-os-ultimate → apps/queen/src/core)..."
if [ -d "$GHOST/core" ]; then
  rsync -a --exclude='node_modules' --exclude='.git' \
    "$GHOST/core/" "$QUEEN/src/core/"
  ok "Core Ghost OS migré"
fi

# ── 6. Dashboard depuis STITCH ─────────────────────────────
log "Migration dashboard (stitch → apps/dashboard)..."
STITCH="$PROJECTS_DIR/stitch"
DASH="$CHIMERA_DIR/apps/dashboard"
if [ -d "$STITCH/apps/closer-web" ]; then
  rsync -a --exclude='node_modules' --exclude='.git' --exclude='.next' \
    "$STITCH/apps/closer-web/" "$DASH/"
  # Copie les packages partagés
  rsync -a --exclude='node_modules' \
    "$STITCH/libs/" "$CHIMERA_DIR/packages/"
  ok "Dashboard + UI kit copiés"
else
  warn "STITCH closer-web non trouvé"
fi

# ── 7. Gateway depuis MOLTBOT ──────────────────────────────
log "Migration gateway (moltbot → apps/gateway)..."
MOLTBOT="$PROJECTS_DIR/moltbot/moltbot"
GATEWAY="$CHIMERA_DIR/apps/gateway"
if [ -d "$MOLTBOT/src" ]; then
  rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
    "$MOLTBOT/src/"          "$GATEWAY/src/"
  rsync -a \
    "$MOLTBOT/package.json"  "$GATEWAY/package.json"
  rsync -a \
    "$MOLTBOT/tsconfig.json" "$GATEWAY/" 2>/dev/null || true
  ok "Gateway copiée"
else
  warn "MOLTBOT src non trouvé"
fi

# ── 8. Memory system depuis pico-omni ──────────────────────
log "Migration mémoire (pico-omni-agentique → agents/memory)..."
OMNI="$PROJECTS_DIR/pico-omni-agentique"
MEMORY="$CHIMERA_DIR/agents/memory"
if [ -d "$OMNI/core" ]; then
  rsync -a --exclude='__pycache__' \
    "$OMNI/core/memory.py"   "$MEMORY/" 2>/dev/null || true
  rsync -a --exclude='__pycache__' \
    "$OMNI/meta/skill_factory.py" "$CHIMERA_DIR/agents/evolution/" 2>/dev/null || true
  rsync -a --exclude='__pycache__' \
    "$OMNI/core/model_router.py" "$CHIMERA_DIR/agents/brain/" 2>/dev/null || true
  ok "Mémoire + SkillFactory + ModelRouter copiés"
fi

# ── 9. .env template ───────────────────────────────────────
log "Création .env depuis .env.example..."
if [ ! -f "$CHIMERA_DIR/.env" ]; then
  cp "$CHIMERA_DIR/.env.example" "$CHIMERA_DIR/.env"
  ok ".env créé — pense à remplir les valeurs"
else
  warn ".env existe déjà — pas écrasé"
fi

# ── Résumé ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Migration terminée ✅             ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Prochaines étapes :"
echo "  1. cd $CHIMERA_DIR"
echo "  2. Remplis .env avec tes clés"
echo "  3. make install"
echo "  4. make dev"
echo ""
