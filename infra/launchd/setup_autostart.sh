#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup_autostart.sh — La Ruche v5 — Auto-démarrage permanent
#
# Ce script configure La Ruche pour :
#   1. Démarrer automatiquement à chaque login macOS
#   2. Rester actif en permanence (PM2 watchdog)
#   3. Travailler pendant la veille (Power Nap + caffeinate)
#   4. Se redémarrer seul en cas de crash
#
# Usage: bash infra/launchd/setup_autostart.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

info()  { echo -e "${BLUE}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✅ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${RESET}"; }
error() { echo -e "${RED}❌ $*${RESET}"; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   LA RUCHE — SETUP AUTO-DÉMARRAGE PERMANENT  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Pré-requis ────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    error "PM2 non trouvé — installer avec: npm install -g pm2"
    exit 1
fi

PM2_PATH="$(which pm2)"
NODE_PATH="$(which node)"
info "PM2: $PM2_PATH"
info "Node: $NODE_PATH"

# Créer les répertoires de logs
mkdir -p "$ROOT/.laruche/logs"
ok "Répertoires logs créés"

# ─── 1. Lancer tous les processus via PM2 ──────────────────────────────────
info "Lancement de tous les processus PM2..."

cd "$ROOT"
pm2 delete all 2>/dev/null || true
pm2 start "$ROOT/infra/launchd/ecosystem.config.cjs" --env production

sleep 3
pm2 status
ok "PM2 démarré (Queen + 11 agents)"

# ─── 2. Sauvegarder l'état PM2 (pour pm2 resurrect) ───────────────────────
info "Sauvegarde de l'état PM2..."
pm2 save --force
ok "État PM2 sauvegardé (~/.pm2/dump.pm2)"

# ─── 3. LaunchAgent PM2 (démarrage auto au login) ─────────────────────────
info "Configuration LaunchAgent (démarrage au login)..."

PLIST_DIR="$HOME/Library/LaunchAgents"
PM2_PLIST="$PLIST_DIR/ai.laruche.pm2.plist"

# Obtenir le chemin du binaire pm2 et node
PM2_HOME="$HOME/.pm2"

cat > "$PM2_PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.laruche.pm2</string>

  <key>ProgramArguments</key>
  <array>
    <string>${PM2_PATH}</string>
    <string>resurrect</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <false/>

  <key>StandardOutPath</key>
  <string>${ROOT}/.laruche/logs/pm2-resurrect.log</string>

  <key>StandardErrorPath</key>
  <string>${ROOT}/.laruche/logs/pm2-resurrect.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$NODE_PATH")</string>
    <key>PM2_HOME</key>
    <string>${PM2_HOME}</string>
    <key>NODE_PATH</key>
    <string>$(node -e "console.log(require('path').join(process.execPath, '../../lib/node_modules'))" 2>/dev/null || echo "/usr/local/lib/node_modules")</string>
    <key>LARUCHE_MODE</key>
    <string>balanced</string>
  </dict>

  <key>ProcessType</key>
  <string>Background</string>

  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
PLIST_EOF

# Charger le LaunchAgent
launchctl unload "$PM2_PLIST" 2>/dev/null || true
launchctl load -w "$PM2_PLIST"
ok "LaunchAgent PM2 installé → $PM2_PLIST"

# ─── 4. LaunchAgent Caffeinate (prévention veille sur secteur) ─────────────
info "Configuration caffeinate (anti-veille sur secteur)..."

CAFE_PLIST="$PLIST_DIR/ai.laruche.caffeinate.plist"

cat > "$CAFE_PLIST" <<CAFE_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.laruche.caffeinate</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>-s</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
CAFE_EOF

launchctl unload "$CAFE_PLIST" 2>/dev/null || true
launchctl load -w "$CAFE_PLIST"
ok "Caffeinate actif (empêche la veille système sur secteur)"

# ─── 5. Power Nap — travail en veille ─────────────────────────────────────
info "Configuration Power Nap (travail pendant la veille)..."

# Activer Power Nap (exécution tâches en veille)
sudo pmset -a powernap 1 2>/dev/null && ok "Power Nap activé" || warn "Power Nap: sudo requis, à faire manuellement: sudo pmset -a powernap 1"

# Empêcher veille disque
sudo pmset -a disksleep 0 2>/dev/null && ok "Disque: pas de veille" || warn "pmset disksleep: sudo requis"

# Wake on LAN/réseau
sudo pmset -a womp 1 2>/dev/null && ok "Wake on LAN activé" || warn "Wake on LAN: sudo requis"

# ─── 6. Résumé final ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║          CONFIGURATION TERMINÉE              ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  PM2 LaunchAgent  → démarrage au login       ║"
echo "║  Caffeinate        → pas de veille système   ║"
echo "║  Power Nap         → actif en veille Mac     ║"
echo "║  11 agents Python  → auto-restart sur crash  ║"
echo "║  Queen :3000       → auto-restart sur crash  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  pm2 status        → état des processus      ║"
echo "║  pm2 logs          → logs en direct          ║"
echo "║  pm2 monit         → monitoring interactif   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "La Ruche tournera maintenant 24h/24 🐝"
echo ""
