#!/bin/bash
set -e

echo "🐝 LaRuche Fast-Install — Démarrage..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

OS=$(uname -s)
ARCH=$(uname -m)
echo "→ Détecté: $OS $ARCH"

# 1. Node.js 20+
if ! node --version 2>/dev/null | grep -qE "v(2[0-9])"; then
  echo "→ Node.js 20+ requis. Installation via nvm..."
  if command -v brew &>/dev/null; then
    brew install node@20
  else
    curl -fsSL https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-x64.tar.xz | tar -xJ -C /tmp
    export PATH="/tmp/node-v20.11.0-linux-x64/bin:$PATH"
  fi
fi
echo "✓ Node.js: $(node --version)"

# 2. Python 3.11+
if ! python3 --version 2>/dev/null | grep -qE "3\.(1[1-9]|[2-9][0-9])"; then
  echo "→ Python 3.11+ requis."
  if command -v brew &>/dev/null; then
    brew install python@3.11
  fi
fi
echo "✓ Python: $(python3 --version)"

# 3. Dépendances Node
echo "→ Installation dépendances Node..."
cd "$ROOT"
npm install --prefer-offline 2>/dev/null || npm install

# 4. Dépendances Python
echo "→ Installation dépendances Python..."
python3 -m pip install -r requirements.txt -q

# 5. Ollama
if ! command -v ollama &>/dev/null; then
  echo "→ Installation Ollama..."
  curl -fsSL https://ollama.ai/install.sh | sh
fi

# 6. Modèles Ollama
echo "→ Pull modèles Ollama (llama3.2:3b + llava:7b)..."
ollama pull llama3.2:3b &
ollama pull llava:7b &
wait
echo "✓ Modèles Ollama prêts"

# 7. Copie .env
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "→ .env créé depuis .env.example — configurez vos API keys"
fi

# 8. PM2
echo "→ Démarrage LaRuche via PM2..."
npx pm2 start "$ROOT/ecosystem.config.js" --env production
npx pm2 save

echo ""
echo "✅ LaRuche opérationnelle!"
echo "   Dashboard: http://localhost:8080"
echo "   Configurez vos API keys dans .env puis: /status sur Telegram"
