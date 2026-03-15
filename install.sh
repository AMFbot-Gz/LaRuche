#!/usr/bin/env bash
# install.sh — Chimera One-Click Installer
# Fonctionne sur macOS et Linux
# Usage : bash install.sh

set -euo pipefail

# ─── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Fonctions d'affichage ─────────────────────────────────────────────────────
ok()   { echo -e "${GREEN}  [OK]${NC}    $*"; }
fail() { echo -e "${RED}  [FAIL]${NC}  $*"; }
warn() { echo -e "${YELLOW}  [WARN]${NC}  $*"; }
info() { echo -e "${BLUE}  [INFO]${NC}  $*"; }
step() { echo -e "\n${CYAN}${BOLD}==> $*${NC}"; }

# ─── Bannière ──────────────────────────────────────────────────────────────────
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
  ╔══════════════════════════════════════════════════════════╗
  ║       🐝  Chimera — One-Click Installer                  ║
  ║       Local-first autonomous AI OS                       ║
  ╚══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

START_TIME=$(date +%s)
ERRORS=0

# ─── Utilitaire : version comparaison ─────────────────────────────────────────
version_gte() {
  # Retourne 0 (true) si $1 >= $2
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]
}

# ─── Étape 1 : Node.js >= 20 ──────────────────────────────────────────────────
step "Vérification Node.js >= 20"
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node.js ${NODE_VERSION} trouvé"
  else
    fail "Node.js ${NODE_VERSION} trop ancien (requis : >= 20)"
    echo ""
    info "Installez Node.js 20+ via :"
    info "  macOS : brew install node@20  ou  nvm install 20"
    info "  Linux : nvm install 20  (https://github.com/nvm-sh/nvm)"
    info "  ou    : https://nodejs.org/en/download"
    ERRORS=$((ERRORS + 1))
    exit 1
  fi
else
  fail "Node.js non trouvé"
  echo ""
  info "Installez Node.js 20+ via :"
  info "  macOS : brew install node@20  ou  nvm install 20"
  info "  Linux : nvm install 20  (https://github.com/nvm-sh/nvm)"
  info "  ou    : https://nodejs.org/en/download"
  ERRORS=$((ERRORS + 1))
  exit 1
fi

# ─── Étape 2 : pnpm >= 8 ──────────────────────────────────────────────────────
step "Vérification pnpm >= 8"
if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version)
  PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
  if [ "$PNPM_MAJOR" -ge 8 ]; then
    ok "pnpm ${PNPM_VERSION} trouvé"
  else
    warn "pnpm ${PNPM_VERSION} trop ancien — mise à jour..."
    if npm install -g pnpm@latest; then
      ok "pnpm mis à jour vers $(pnpm --version)"
    else
      fail "Impossible de mettre à jour pnpm"
      ERRORS=$((ERRORS + 1))
      exit 1
    fi
  fi
else
  info "pnpm non trouvé — installation en cours..."
  if npm install -g pnpm@latest; then
    ok "pnpm $(pnpm --version) installé"
  else
    fail "Impossible d'installer pnpm via npm"
    info "Essayez manuellement : npm install -g pnpm"
    ERRORS=$((ERRORS + 1))
    exit 1
  fi
fi

# ─── Étape 3 : Python >= 3.10 ─────────────────────────────────────────────────
step "Vérification Python >= 3.10"
PYTHON_CMD=""
for cmd in python3.12 python3.11 python3.10 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY_VERSION=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
      PYTHON_CMD="$cmd"
      break
    fi
  fi
done

if [ -n "$PYTHON_CMD" ]; then
  ok "Python ${PY_VERSION} trouvé (${PYTHON_CMD})"
else
  fail "Python >= 3.10 non trouvé"
  echo ""
  info "Installez Python 3.11+ via :"
  info "  macOS : brew install python@3.11  ou  pyenv install 3.11"
  info "  Linux : sudo apt install python3.11  ou  pyenv install 3.11"
  info "  ou    : https://www.python.org/downloads"
  ERRORS=$((ERRORS + 1))
  exit 1
fi

# ─── Étape 4 : uv ─────────────────────────────────────────────────────────────
step "Vérification uv (gestionnaire Python)"
if command -v uv &>/dev/null; then
  UV_VERSION=$(uv --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  ok "uv ${UV_VERSION} trouvé"
else
  info "uv non trouvé — installation en cours..."
  if curl -LsSf https://astral.sh/uv/install.sh | sh; then
    # Recharge PATH pour trouver uv
    export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
    if command -v uv &>/dev/null; then
      ok "uv $(uv --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) installé"
    else
      warn "uv installé mais non accessible dans PATH — rechargez votre shell"
      info "  source ~/.bashrc  ou  source ~/.zshrc"
      # Non-bloquant : on continue et on espère que uv est dans PATH pour uv sync
    fi
  else
    fail "Impossible d'installer uv"
    info "Installez manuellement : curl -LsSf https://astral.sh/uv/install.sh | sh"
    ERRORS=$((ERRORS + 1))
    exit 1
  fi
fi

# ─── Étape 5 : Ollama ─────────────────────────────────────────────────────────
step "Vérification Ollama"
OLLAMA_PRESENT=false
if command -v ollama &>/dev/null; then
  ok "Ollama trouvé ($(ollama --version 2>/dev/null | head -1 || echo 'version inconnue'))"
  OLLAMA_PRESENT=true
else
  warn "Ollama non trouvé — certaines fonctionnalités LLM seront indisponibles"
  echo ""
  info "Installez Ollama :"
  info "  macOS/Linux : curl -fsSL https://ollama.com/install.sh | sh"
  info "  macOS (brew): brew install ollama"
  info "  Téléchargement : https://ollama.ai/download"
  info ""
  info "Après installation, lancez : ollama serve"
  # Non-bloquant : Ollama est requis pour les LLM mais pas pour démarrer
fi

# ─── Étape 6 : Fichier .env ───────────────────────────────────────────────────
step "Vérification du fichier .env"
if [ -f ".env" ]; then
  ok ".env déjà présent"
else
  if [ -f ".env.example" ]; then
    cp .env.example .env
    ok ".env créé depuis .env.example"
    echo ""
    warn "IMPORTANT : Éditez .env avant de lancer Chimera !"
    info "  Variables à configurer :"
    info "  - CHIMERA_SECRET  (générez : openssl rand -hex 32)"
    info "  - DASHBOARD_TOKEN (générez : openssl rand -hex 24)"
    info "  - ANTHROPIC_API_KEY (optionnel — pour routing Claude)"
    info ""
    info "  Commande : nano .env  ou  code .env"
  else
    warn ".env.example introuvable — création d'un .env minimal"
    cat > .env << 'ENVEOF'
# Chimera — Configuration minimale
# Générez vos secrets : openssl rand -hex 32
CHIMERA_SECRET=CHANGE_ME_openssl_rand_hex_32
NODE_ENV=development
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_DEFAULT=llama3.2:3b
STANDALONE_MODE=true
QUEEN_PORT=3000
HUD_PORT=9001
DASHBOARD_TOKEN=CHANGE_ME_openssl_rand_hex_24
ENVEOF
    warn "Éditez .env avec vos valeurs avant de lancer Chimera"
  fi
fi

# ─── Étape 7 : pnpm install ───────────────────────────────────────────────────
step "Installation des dépendances Node.js (pnpm install)"
if pnpm install --ignore-scripts; then
  ok "Dépendances Node.js installées"
else
  fail "Échec de pnpm install"
  ERRORS=$((ERRORS + 1))
  exit 1
fi

# ─── Étape 8 : uv sync ────────────────────────────────────────────────────────
step "Installation des dépendances Python (uv sync)"
if command -v uv &>/dev/null; then
  if uv sync; then
    ok "Dépendances Python installées"
  else
    fail "Échec de uv sync"
    warn "Essayez : uv sync --no-build-isolation"
    ERRORS=$((ERRORS + 1))
    # Non-bloquant si Python agents pas encore configurés
  fi
else
  warn "uv non accessible dans PATH — sautez uv sync"
  info "Après avoir rechargé votre shell : uv sync"
fi

# ─── Étape 9 : ollama pull llama3.2:3b ────────────────────────────────────────
step "Téléchargement du modèle Ollama par défaut (llama3.2:3b)"
if [ "$OLLAMA_PRESENT" = true ]; then
  # Vérifie si le modèle est déjà présent
  if ollama list 2>/dev/null | grep -q "llama3.2:3b"; then
    ok "Modèle llama3.2:3b déjà présent"
  else
    # Vérifie qu'Ollama serve est en cours
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
      info "Téléchargement de llama3.2:3b (2GB — peut prendre quelques minutes)..."
      if ollama pull llama3.2:3b; then
        ok "Modèle llama3.2:3b téléchargé"
      else
        warn "Échec du téléchargement de llama3.2:3b"
        info "Lancez manuellement : ollama pull llama3.2:3b"
      fi
    else
      warn "Ollama server non démarré — modèle non téléchargé automatiquement"
      info "Démarrez Ollama (ollama serve) puis : ollama pull llama3.2:3b"
    fi
  fi
else
  info "Ollama absent — étape ignorée (SKIPPED)"
fi

# ─── Calcul durée ─────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_FMT="$((DURATION / 60))m $((DURATION % 60))s"

# ─── Résumé final ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════${NC}"

if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✅ Chimera installé avec succès ! (${DURATION_FMT})${NC}"
  echo ""
  echo -e "${BOLD}  Prochaines étapes :${NC}"
  echo -e "  1. Éditez ${CYAN}.env${NC} (CHIMERA_SECRET, DASHBOARD_TOKEN)"
  echo -e "  2. Démarrez Ollama : ${CYAN}ollama serve${NC}"
  echo -e "  3. Lancez Chimera  : ${CYAN}make dev${NC}"
  echo ""
  echo -e "  Documentation : ${CYAN}http://localhost:3001${NC} (dashboard)"
  echo -e "  API           : ${CYAN}http://localhost:3000${NC}"
  echo -e "  Santé système : ${CYAN}curl http://localhost:3000/api/doctor${NC}"
else
  echo -e "${RED}${BOLD}  ❌ Installation incomplète — ${ERRORS} erreur(s) (${DURATION_FMT})${NC}"
  echo -e "  Corrigez les erreurs ci-dessus puis relancez : ${CYAN}bash install.sh${NC}"
fi

echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════${NC}"
echo ""
