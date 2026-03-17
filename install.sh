#!/usr/bin/env bash
# install.sh — La Ruche / Chimera — Installateur One-Click
# Usage one-liner : curl -fsSL https://raw.githubusercontent.com/AMFbot-Gz/LaRuche/main/install.sh | bash
# Usage local    : bash install.sh
# Supporte macOS et Linux

set -euo pipefail

# ─── Couleurs ANSI ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Fonctions d'affichage ─────────────────────────────────────────────────────
ok()    { echo -e "${GREEN}  [OK]${NC}    $*"; }
fail()  { echo -e "${RED}  [FAIL]${NC}  $*"; }
warn()  { echo -e "${YELLOW}  [WARN]${NC}  $*"; }
info()  { echo -e "${BLUE}  [INFO]${NC}  $*"; }
step()  { echo -e "\n${CYAN}${BOLD}━━━  $*  ━━━${NC}"; }
ask()   { echo -e "${MAGENTA}  [?]${NC}    $*"; }

# ─── Bannière ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}${BOLD}"
cat << 'BANNER'
  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║     ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗              ║
  ║     ██╔══██╗██║   ██║██╔════╝██║  ██║██╔════╝              ║
  ║     ██████╔╝██║   ██║██║     ███████║█████╗                 ║
  ║     ██╔══██╗██║   ██║██║     ██╔══██║██╔══╝                 ║
  ║     ██║  ██║╚██████╔╝╚██████╗██║  ██║███████╗              ║
  ║     ╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝              ║
  ║                                                              ║
  ║     La Ruche — OS Agentique IA  ·  One-Click Installer      ║
  ║     Local-first · Autonomous · Open Source                   ║
  ╚══════════════════════════════════════════════════════════════╝
BANNER
echo -e "${NC}"

START_TIME=$(date +%s)
ERRORS=0
WARNINGS=0
REPO_DIR=""
OS_TYPE="$(uname -s)"

# ─── Détection OS ──────────────────────────────────────────────────────────────
if [ "$OS_TYPE" = "Darwin" ]; then
  IS_MAC=true
else
  IS_MAC=false
fi

# ─── Utilitaire : comparaison versions ─────────────────────────────────────────
version_gte() {
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]
}

# ─── Étape 0 : Clone du repo si nécessaire ─────────────────────────────────────
step "0/9 · Clonage du repo"

# Si on est déjà dans le repo (run local), on reste sur place
if [ -f "Makefile" ] && [ -f "pnpm-workspace.yaml" ] && [ -d "agents" ]; then
  REPO_DIR="$(pwd)"
  ok "Déjà dans le repo Chimera : ${REPO_DIR}"
elif [ -d "$HOME/Projects/LaRuche" ]; then
  REPO_DIR="$HOME/Projects/LaRuche"
  cd "$REPO_DIR"
  ok "Repo existant trouvé : ${REPO_DIR}"
  git pull origin main 2>/dev/null || warn "Impossible de git pull (continuer quand même)"
else
  REPO_DIR="$HOME/Projects/LaRuche"
  info "Clonage dans ${REPO_DIR}..."
  git clone https://github.com/AMFbot-Gz/LaRuche.git "$REPO_DIR"
  cd "$REPO_DIR"
  ok "Repo cloné dans ${REPO_DIR}"
fi

# ─── Étape 1 : Node.js >= 20 ───────────────────────────────────────────────────
step "1/9 · Node.js >= 20"
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node.js ${NODE_VERSION}"
  else
    fail "Node.js ${NODE_VERSION} trop ancien (requis : >= 20)"
    info "  macOS : brew install node@22  ou  nvm install 22"
    info "  Linux : nvm install 22"
    ERRORS=$((ERRORS + 1)); exit 1
  fi
else
  fail "Node.js non trouvé"
  info "  macOS : brew install node@22  ou  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && nvm install 22"
  info "  Linux : curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && nvm install 22"
  ERRORS=$((ERRORS + 1)); exit 1
fi

# ─── Étape 2 : pnpm >= 8 ───────────────────────────────────────────────────────
step "2/9 · pnpm >= 8"
if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version)
  PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
  if [ "$PNPM_MAJOR" -ge 8 ]; then
    ok "pnpm ${PNPM_VERSION}"
  else
    warn "pnpm ${PNPM_VERSION} trop ancien — mise à jour..."
    npm install -g pnpm@latest && ok "pnpm $(pnpm --version) installé"
  fi
else
  info "pnpm non trouvé — installation..."
  npm install -g pnpm@latest && ok "pnpm $(pnpm --version) installé"
fi

# ─── Étape 3 : Python >= 3.11 ──────────────────────────────────────────────────
step "3/9 · Python >= 3.11"
PYTHON_CMD=""
for cmd in python3.13 python3.12 python3.11 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY_VERSION=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 11 ]; then
      PYTHON_CMD="$cmd"; break
    fi
  fi
done

if [ -n "$PYTHON_CMD" ]; then
  ok "Python ${PY_VERSION} (${PYTHON_CMD})"
else
  fail "Python >= 3.11 non trouvé"
  info "  macOS : brew install python@3.12  ou  pyenv install 3.12"
  info "  Linux : sudo apt install python3.12  ou  pyenv install 3.12"
  ERRORS=$((ERRORS + 1)); exit 1
fi

# ─── Étape 4 : uv ──────────────────────────────────────────────────────────────
step "4/9 · uv (gestionnaire Python)"
if command -v uv &>/dev/null; then
  UV_VERSION=$(uv --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  ok "uv ${UV_VERSION}"
else
  info "uv non trouvé — installation..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
  if command -v uv &>/dev/null; then
    ok "uv $(uv --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) installé"
  else
    warn "uv installé mais non accessible — rechargez votre shell : source ~/.zshrc"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ─── Étape 5 : Ollama ──────────────────────────────────────────────────────────
step "5/9 · Ollama (LLM local)"
OLLAMA_PRESENT=false
OLLAMA_RUNNING=false

if command -v ollama &>/dev/null; then
  ok "Ollama installé ($(ollama --version 2>/dev/null | head -1 || echo 'version inconnue'))"
  OLLAMA_PRESENT=true
  if curl -sf http://localhost:11434/api/tags &>/dev/null; then
    ok "Ollama server actif sur :11434"
    OLLAMA_RUNNING=true
  else
    warn "Ollama installé mais serveur non démarré"
    info "  Démarrez avec : ollama serve  (en arrière-plan)"
  fi
else
  warn "Ollama non trouvé"
  info "  macOS/Linux : curl -fsSL https://ollama.com/install.sh | sh"
  info "  macOS (brew): brew install ollama"
  WARNINGS=$((WARNINGS + 1))
fi

# ─── Étape 6 : Docker / Redis ──────────────────────────────────────────────────
step "6/9 · Redis (via Docker)"
REDIS_OK=false

# Vérifier Redis direct
if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
  ok "Redis déjà actif (natif)"
  REDIS_OK=true
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  # Vérifie si un container Redis tourne déjà
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q redis; then
    ok "Redis container Docker déjà en cours d'exécution"
    REDIS_OK=true
  else
    info "Démarrage de Redis via Docker..."
    if docker run -d --name chimera-redis -p 6379:6379 --restart=unless-stopped redis:7-alpine &>/dev/null 2>&1; then
      ok "Redis container 'chimera-redis' démarré sur :6379"
      REDIS_OK=true
    else
      warn "Impossible de démarrer Redis Docker"
      info "  Essayez manuellement : docker run -d --name chimera-redis -p 6379:6379 redis:7-alpine"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
else
  warn "Docker non trouvé — Redis ignoré"
  info "  Installez Docker Desktop : https://www.docker.com/products/docker-desktop"
  info "  Ou Redis natif : brew install redis && brew services start redis"
  WARNINGS=$((WARNINGS + 1))
fi

# ─── Étape 7 : Fichier .env ────────────────────────────────────────────────────
step "7/9 · Configuration .env"
if [ -f ".env" ]; then
  ok ".env déjà présent"
else
  if [ -f ".env.example" ]; then
    cp .env.example .env
    ok ".env créé depuis .env.example"
  else
    warn ".env.example introuvable — création d'un .env minimal"
    cat > .env << 'ENVEOF'
# La Ruche / Chimera — Configuration minimale
CHIMERA_SECRET=CHANGE_ME_openssl_rand_hex_32
NODE_ENV=development
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_DEFAULT=llama3.2:3b
STANDALONE_MODE=true
QUEEN_PORT=3000
HUD_PORT=9001
DASHBOARD_PORT=3001
DASHBOARD_TOKEN=CHANGE_ME_openssl_rand_hex_24
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
ADMIN_TELEGRAM_ID=
ENVEOF
  fi

  echo ""
  warn "IMPORTANT — Configurez votre .env :"
  info "  1. CHIMERA_SECRET     : openssl rand -hex 32"
  info "  2. DASHBOARD_TOKEN    : openssl rand -hex 24"
  info "  3. ANTHROPIC_API_KEY  : https://console.anthropic.com"
  info "  4. TELEGRAM_BOT_TOKEN : @BotFather sur Telegram (optionnel)"
  echo ""
  ask "Ouvrir .env maintenant pour configurer ? [O/n]"
  read -r OPEN_ENV </dev/tty 2>/dev/null || OPEN_ENV="n"
  if [[ "$OPEN_ENV" =~ ^[Oo]$ ]] || [ -z "$OPEN_ENV" ]; then
    if command -v code &>/dev/null; then
      code .env
    elif command -v nano &>/dev/null; then
      nano .env
    else
      info "Éditez .env manuellement : nano .env  ou  vi .env"
    fi
  fi
fi

# ─── Étape 8 : Installation des dépendances ────────────────────────────────────
step "8/9 · Installation des dépendances"

info "Installation Node.js (pnpm install)..."
if pnpm install --ignore-scripts; then
  ok "Dépendances Node.js installées"
else
  fail "pnpm install a échoué"
  ERRORS=$((ERRORS + 1))
fi

info "Installation Python (uv sync)..."
if command -v uv &>/dev/null; then
  if uv sync; then
    ok "Dépendances Python installées"
  else
    warn "uv sync a échoué — continuons"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  warn "uv non disponible — sautez uv sync"
  WARNINGS=$((WARNINGS + 1))
fi

# ─── Étape 9 : Modèle Ollama ───────────────────────────────────────────────────
step "9/9 · Modèle Ollama"
if [ "$OLLAMA_RUNNING" = true ]; then
  DEFAULT_MODEL="llama3.2:3b"
  if ollama list 2>/dev/null | grep -q "$DEFAULT_MODEL"; then
    ok "Modèle ${DEFAULT_MODEL} déjà présent"
  else
    echo ""
    ask "Télécharger le modèle ${DEFAULT_MODEL} (~2 GB) ? [O/n]"
    read -r PULL_MODEL </dev/tty 2>/dev/null || PULL_MODEL="n"
    if [[ "$PULL_MODEL" =~ ^[Oo]$ ]] || [ -z "$PULL_MODEL" ]; then
      info "Téléchargement de ${DEFAULT_MODEL} (peut prendre quelques minutes)..."
      if ollama pull "$DEFAULT_MODEL"; then
        ok "Modèle ${DEFAULT_MODEL} téléchargé"
      else
        warn "Téléchargement échoué — lancez : ollama pull ${DEFAULT_MODEL}"
        WARNINGS=$((WARNINGS + 1))
      fi
    else
      info "Ignoré — lancez manuellement : ollama pull ${DEFAULT_MODEL}"
    fi
  fi

  # Proposer un modèle code si pas présent
  CODE_MODEL="qwen2.5-coder:7b"
  if ! ollama list 2>/dev/null | grep -q "$CODE_MODEL"; then
    echo ""
    ask "Télécharger aussi ${CODE_MODEL} (modèle code, ~5 GB) ? [o/N]"
    read -r PULL_CODE </dev/tty 2>/dev/null || PULL_CODE="n"
    if [[ "$PULL_CODE" =~ ^[Oo]$ ]]; then
      info "Téléchargement de ${CODE_MODEL}..."
      ollama pull "$CODE_MODEL" && ok "Modèle ${CODE_MODEL} téléchargé" || warn "Échec — lancez : ollama pull ${CODE_MODEL}"
    fi
  fi
elif [ "$OLLAMA_PRESENT" = true ]; then
  info "Ollama présent mais server non actif — modèles non vérifiés"
  info "Démarrez : ollama serve  puis  ollama pull llama3.2:3b"
else
  info "Ollama absent — étape ignorée"
fi

# ─── LaunchAgent macOS (auto-start) ────────────────────────────────────────────
if [ "$IS_MAC" = true ] && [ "$ERRORS" -eq 0 ]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_FILE="$PLIST_DIR/com.laruche.chimera.plist"
  REPO_ABS="$(cd "$(pwd)" && pwd)"

  echo ""
  ask "Créer un LaunchAgent macOS pour démarrer La Ruche au login ? [o/N]"
  read -r CREATE_AGENT </dev/tty 2>/dev/null || CREATE_AGENT="n"
  if [[ "$CREATE_AGENT" =~ ^[Oo]$ ]]; then
    mkdir -p "$PLIST_DIR"
    cat > "$PLIST_FILE" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.laruche.chimera</string>
    <key>ProgramArguments</key>
    <array>
        <string>${REPO_ABS}/start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>${REPO_ABS}</string>
    <key>StandardOutPath</key>
    <string>/tmp/chimera_launchagent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/chimera_launchagent.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.local/bin</string>
    </dict>
</dict>
</plist>
PLISTEOF
    launchctl load "$PLIST_FILE" 2>/dev/null || true
    ok "LaunchAgent créé : ${PLIST_FILE}"
    info "  Pour activer l'auto-start : launchctl enable gui/$(id -u)/com.laruche.chimera"
    info "  Pour démarrer : launchctl start com.laruche.chimera"
    info "  Pour supprimer : launchctl unload ${PLIST_FILE} && rm ${PLIST_FILE}"
  fi
fi

# ─── CLI ruche ─────────────────────────────────────────────────────────────────
if [ -f "ruche" ]; then
  chmod +x ruche
  # Proposer d'ajouter dans PATH
  if [ "$IS_MAC" = true ]; then
    LOCAL_BIN="$HOME/.local/bin"
    if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
      info "Conseil : ajoutez ${LOCAL_BIN} à votre PATH pour utiliser 'ruche' partout"
      info "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
    fi
    mkdir -p "$LOCAL_BIN"
    ln -sf "$(pwd)/ruche" "$LOCAL_BIN/ruche" 2>/dev/null && ok "Lien symbolique créé : ${LOCAL_BIN}/ruche" || true
  fi
fi

# ─── Calcul durée ──────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_FMT="$((DURATION / 60))m $((DURATION % 60))s"

# ─── Résumé final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${NC}"

if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  La Ruche installée avec succes ! (${DURATION_FMT})${NC}"
  if [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}  ${WARNINGS} avertissement(s) — voir ci-dessus${NC}"
  fi
  echo ""
  echo -e "${BOLD}  Prochaines etapes :${NC}"
  echo -e "  ${DIM}1.${NC} Verifier .env         ${CYAN}nano .env${NC}"
  echo -e "  ${DIM}2.${NC} Demarrer La Ruche     ${CYAN}./ruche start${NC}  ou  ${CYAN}make dev${NC}"
  echo -e "  ${DIM}3.${NC} Wizard interactif     ${CYAN}./ruche onboard${NC}"
  echo ""
  echo -e "  ${BOLD}URLs :${NC}"
  echo -e "  Queen API        ${CYAN}http://localhost:3000${NC}"
  echo -e "  Dashboard        ${CYAN}http://localhost:3001${NC}"
  echo -e "  Agents           ${CYAN}http://localhost:8001-8009${NC}"
  echo -e "  Health check     ${CYAN}curl http://localhost:3000/api/health${NC}"
  echo ""
  echo -e "  ${BOLD}Commandes utiles :${NC}"
  echo -e "  ${CYAN}./ruche status${NC}   — etat des services"
  echo -e "  ${CYAN}./ruche health${NC}   — diagnostic complet"
  echo -e "  ${CYAN}./ruche logs${NC}     — logs en temps reel"
  echo -e "  ${CYAN}make help${NC}        — toutes les commandes Make"
else
  echo -e "${RED}${BOLD}  Installation incomplete — ${ERRORS} erreur(s) (${DURATION_FMT})${NC}"
  echo -e "  Corrigez les erreurs ci-dessus puis relancez : ${CYAN}bash install.sh${NC}"
fi

echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo ""
