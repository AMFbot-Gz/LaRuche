#!/usr/bin/env bash
# import_all.sh — Importe tous les workflows N8N dans le container Docker
# Usage: ./import_all.sh [container_name]
set -euo pipefail

CONTAINER="${1:-n8n-openclaw}"
WORKFLOWS_DIR="$(cd "$(dirname "$0")/workflows" && pwd)"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'

echo -e "\n${BOLD}🔧 Import workflows N8N → $CONTAINER${RESET}\n"

# Vérifier que le container tourne
if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q "true"; then
  echo -e "${RED}❌ Container '$CONTAINER' non trouvé ou arrêté${RESET}"
  echo "   Démarrer avec: docker compose up -d"
  exit 1
fi
echo -e "${GREEN}✅ Container $CONTAINER actif${RESET}"

# Créer le répertoire dans le container
docker exec "$CONTAINER" mkdir -p /tmp/n8n_import

# Compteurs
IMPORTED=0; FAILED=0

# Importer chaque workflow
for wf_file in "$WORKFLOWS_DIR"/*.json; do
  wf_name=$(basename "$wf_file" .json)
  echo -e "\n  ${YELLOW}→${RESET} $wf_name"

  # Copier dans le container
  docker cp "$wf_file" "$CONTAINER:/tmp/n8n_import/${wf_name}.json"

  # Importer
  if docker exec "$CONTAINER" n8n import:workflow \
      --input="/tmp/n8n_import/${wf_name}.json" 2>/dev/null; then
    echo -e "    ${GREEN}✅ Importé${RESET}"
    ((IMPORTED++))
  else
    echo -e "    ${RED}❌ Échec import${RESET}"
    ((FAILED++))
  fi
done

# Nettoyer
docker exec "$CONTAINER" rm -rf /tmp/n8n_import 2>/dev/null || true

# Résumé
echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}✅ $IMPORTED workflow(s) importé(s)${RESET}"
[ $FAILED -gt 0 ] && echo -e "${RED}❌ $FAILED échec(s)${RESET}"
echo -e "\n📋 Voir sur: http://localhost:5678"
echo -e "⚠️  Configurer les credentials Telegram dans l'UI N8N"
echo -e "⚠️  Activer les workflows souhaités manuellement"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
