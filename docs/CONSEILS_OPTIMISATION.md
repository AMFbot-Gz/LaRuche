# Conseils & Optimisations — La Ruche v5
*Compilé le 2026-03-17 — Recommandations techniques accumulées en session*

---

## 1. Persistance & Auto-démarrage

### PM2 — Process Manager
```bash
# Sauvegarder l'état actuel
pm2 save --force

# Vérifier que le LaunchAgent est chargé
launchctl list | grep laruche

# En cas de crash de PM2 lui-même
pm2 resurrect

# Monitoring interactif
pm2 monit
```

**Config:** `infra/launchd/ecosystem.config.cjs`

### Anti-veille (caffeinate)
Le LaunchAgent `ai.laruche.caffeinate` lance `caffeinate -i -s` au démarrage :
- `-i` : empêche la veille inactive
- `-s` : empêche la veille système (fonctionne même en veille Mac si sur secteur)

### Power Nap (travail en veille)
```bash
sudo pmset -a powernap 1       # Activer Power Nap
sudo pmset -a disksleep 0      # Pas de veille disque
sudo pmset -a womp 1           # Wake on LAN
pmset -g                       # Vérifier la config
```

---

## 2. Debugging & Diagnostic

### Ports occupés — cause principale de crash
Avant de démarrer via PM2, toujours vider les ports :
```bash
# Tuer tous les anciens agents
for port in 3000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011; do
  pid=$(lsof -ti :$port 2>/dev/null)
  [ -n "$pid" ] && kill -9 $pid && echo "Killed :$port"
done
```

### Lire les logs d'un agent spécifique
```bash
pm2 logs agent-brain --lines 50
pm2 logs laruche-queen --lines 50
tail -f .laruche/logs/agent-brain-error.log
```

### Health check rapide
```bash
for port in 3000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:$port/health)
  echo ":$port → $code"
done
```

---

## 3. Node.js / Queen ESM — Pièges à éviter

### `homedir` vient de `os`, pas de `path`
```javascript
// ❌ FAUX
import { join, homedir } from "path";

// ✅ CORRECT
import { join } from "path";
import { homedir } from "os";
```

### STANDALONE_MODE — obligatoire sans Telegram
La Queen crashe en boucle si `TELEGRAM_BOT_TOKEN` est absent et `STANDALONE_MODE !== "true"`.
Toujours définir dans le config PM2 :
```javascript
env: { STANDALONE_MODE: "true" }
```

### ESM avec PM2
PM2 gère les modules ESM (`.js` avec `"type":"module"`) directement — pas besoin de `--experimental-vm-modules`.

---

## 4. Python / uv — Bonnes pratiques

### Lancer un agent via uv
```bash
# Depuis la racine du projet
uv run uvicorn agents.brain.brain:app --host 0.0.0.0 --port 8003

# Pour les agents avec cwd spécifique (evolution, mcp-bridge)
cd agents/evolution && uv run uvicorn auto_coder_bee:app --port 8005
```

### Module shadowing — piège courant
Si tu as un dossier `agent/` ET un fichier `agent.py` → Python importe le dossier.
```bash
# Solution : supprimer le répertoire fantôme
rm -rf agent/
```

### Deprecated warning `tool.uv.dev-dependencies`
Remplacer dans `pyproject.toml` :
```toml
# ❌ Deprecated
[tool.uv]
dev-dependencies = [...]

# ✅ Nouveau format
[dependency-groups]
dev = [...]
```

---

## 5. Architecture Multi-Agents

### Pattern health check parallèle
```javascript
// Promise.allSettled — ne bloque pas si un agent est down
const results = await Promise.allSettled(
  AGENTS.map(agent =>
    fetch(`http://localhost:${agent.port}/health`, {
      signal: AbortSignal.timeout(3000)
    })
  )
)
```

### Circuit breaker Ollama
Le circuit breaker (`packages/resilience/circuit_breaker.py`) protège contre les appels en cascade :
- `fail_max=5` : ouvre après 5 échecs
- `reset_timeout=60` : tente de se refermer après 60s
- `backoff=2` : délai exponentiel entre tentatives

### Smart Model Routing — règle d'or
| Type de tâche | Modèle optimal |
|---------------|----------------|
| Code | `qwen3-coder` |
| Vision | `llama3.2-vision` |
| Rapide | `llama3.2:3b` |
| Raisonnement | `glm-4.6` |
| Général | `gpt-oss:20b` |
| Lourd | `gpt-oss:120b` |

---

## 6. N8N — Intégration Workflows

### Importer des workflows en une commande
```bash
docker cp infra/n8n_workflows/workflows/01-health-monitor.json n8n-openclaw:/tmp/
docker exec n8n-openclaw n8n import:workflow --input=/tmp/01-health-monitor.json
```

### Webhook bidirectionnel Queen ↔ N8N
- N8N → Queen : `POST http://localhost:3000/webhook/n8n`
- Queen → N8N : `POST http://localhost:5678/webhook/[workflow-id]`

### Variables d'env N8N à configurer
```
N8N_WEBHOOK_URL=http://localhost:5678
N8N_API_KEY=[générer dans n8n → Settings → API]
QUEEN_URL=http://localhost:3000
```

---

## 7. GitHub — Gestion du dépôt

### Désarchiver un dépôt GitHub
```bash
gh api repos/AMFbot-Gz/LaRuche -X PATCH -f archived=false
```

### Push propre
```bash
git add -p                 # Réviser chaque changement
git status --short         # Vue rapide
git push origin main
```

---

## 8. macOS — Optimisations système

### Vérifier ce qui écoute sur un port
```bash
lsof -i :3000
lsof -ti :3000   # Juste le PID
```

### LaunchAgent vs LaunchDaemon
- **LaunchAgent** (`~/Library/LaunchAgents/`) → démarre avec la session utilisateur (login)
- **LaunchDaemon** (`/Library/LaunchDaemons/`) → démarre au boot (root requis)
Pour La Ruche : LaunchAgent suffit.

### Vérifier les LaunchAgents actifs
```bash
launchctl list | grep laruche
launchctl print gui/$(id -u)/ai.laruche.pm2
```

---

## 9. Commandes La Ruche au quotidien

```bash
# Status complet
pm2 status

# Redémarrer tout proprement
for port in 3000 8001-8011; do lsof -ti :$port | xargs kill -9 2>/dev/null; done
pm2 restart all

# Logs en direct (tous)
pm2 logs

# Logs d'un agent
pm2 logs agent-brain

# Monitoring interactif
pm2 monit

# Sauvegarder l'état (après modif)
pm2 save --force

# Soumettre une mission
curl -X POST http://localhost:3000/mission \
  -H "Content-Type: application/json" \
  -d '{"mission": "Analyse les logs et génère un rapport"}'
```

---

## 10. Roadmap — Prochaines améliorations

- [ ] **Telegram Bot** — configurer `TELEGRAM_BOT_TOKEN` pour les alertes et le contrôle à distance
- [ ] **Dashboard Next.js** — lancer `apps/dashboard` pour l'UI graphique (:3001)
- [ ] **ChromaDB** — activer la mémoire vectorielle longue durée
- [ ] **Voice pipeline** — tester Whisper STT + macOS TTS (`:8011`)
- [ ] **Goals autonomes** — activer la boucle d'objectifs automatiques (`:8010`)
- [ ] **Computer Use** — activer la boucle screenshot → action pour l'autonomie visuelle
- [ ] **pmset Power Nap** — `sudo pmset -a powernap 1` pour bossez pendant la veille
