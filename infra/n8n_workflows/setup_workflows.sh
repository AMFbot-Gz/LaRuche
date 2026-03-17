#!/bin/bash
# Crée les workflows N8N essentiels pour La Ruche
N8N_URL="${N8N_URL:-http://localhost:5678}"
RUCHE_URL="${RUCHE_URL:-http://localhost:3000}"

echo "🔧 Configuration des workflows N8N pour La Ruche..."

# Test de connexion
if ! curl -s "$N8N_URL/healthz" > /dev/null; then
  echo "❌ N8N inaccessible sur $N8N_URL"
  exit 1
fi
echo "✅ N8N accessible"

# Créer les 5 workflows essentiels via l'executor
for workflow in "daily-report" "file-monitor" "github-monitor" "mission-scheduler" "health-monitor"; do
  echo "  → Création workflow: $workflow"
  curl -s -X POST "http://localhost:8004/n8n/create" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$workflow\", \"description\": \"La Ruche automation: $workflow\"}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'  ✅ {d.get(\"name\", \"?\")}: créé (id={d.get(\"id\", \"?\")})')
except:
    print(f'  ⚠️  réponse non JSON')
"
done

echo ""
echo "✅ Workflows N8N configurés"
echo "📋 Voir sur: $N8N_URL"
