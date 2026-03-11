# Mode Standalone — LaRuche sans Telegram

> Testez et utilisez LaRuche directement depuis le dashboard ou l'API REST, sans configurer de bot Telegram.

---

## Pourquoi le mode standalone ?

Par défaut, LaRuche requiert un bot Telegram pour fonctionner. Le mode standalone supprime cette contrainte :

| Fonctionnalité | Mode normal | Mode standalone |
|----------------|-------------|-----------------|
| Bot Telegram   | ✅ Requis   | ❌ Optionnel |
| API REST       | ❌          | ✅ Port 3000 |
| Dashboard      | ✅          | ✅ Port 8080 |
| Missions       | Via Telegram | Via API / Dashboard |
| WebSocket HUD  | ✅          | ✅ Port 9001 |

---

## Activation

### Dans `.env`

```bash
# Mode standalone — Telegram non requis
STANDALONE_MODE=true

# Port de l'API REST (défaut : 3000)
API_PORT=3000

# CORS — origine autorisée pour le dashboard
CORS_ORIGIN=http://localhost:8080
```

### Démarrage

```bash
# Option 1 — Variable d'environnement inline
STANDALONE_MODE=true node src/queen_oss.js

# Option 2 — Via .env
laruche start
```

```
╔══════════════════════════════════════════╗
║ 🐝 LaRuche OSS v3.2 — Standalone       ║
╚══════════════════════════════════════════╝
🌐 API Standalone: http://localhost:3000
📖 Endpoints: http://localhost:3000/
✅ Rôles préchauffés: glm-4.6, qwen3-coder, llama3.2:3b, llava:7b
```

---

## API REST

### `GET /`

Retourne la liste des endpoints disponibles.

```bash
curl http://localhost:3000/
```

```json
{
  "name": "LaRuche API",
  "version": "3.2.0",
  "mode": "standalone",
  "endpoints": [
    "POST /api/mission",
    "GET  /api/missions",
    "GET  /api/missions/:id",
    "GET  /api/status",
    "GET  /api/agents",
    "POST /api/search",
    "GET  /api/health"
  ]
}
```

---

### `POST /api/mission` — Envoyer une mission

```bash
curl -X POST http://localhost:3000/api/mission \
  -H "Content-Type: application/json" \
  -d '{"command": "Liste les 5 fichiers les plus gros du projet"}'
```

**Réponse (202 Accepted) :**
```json
{
  "missionId": "m-1741700000000-abc123",
  "status": "pending"
}
```

La mission s'exécute de manière **asynchrone**. Utilisez `GET /api/missions/:id` pour suivre la progression.

---

### `GET /api/missions/:id` — Statut d'une mission

```bash
curl http://localhost:3000/api/missions/m-1741700000000-abc123
```

**En cours :**
```json
{
  "id": "m-1741700000000-abc123",
  "command": "Liste les 5 fichiers...",
  "status": "running",
  "events": [
    {"type": "thinking", "agent": "strategist", "ts": "2026-03-11T..."},
    {"type": "plan_ready", "ts": "2026-03-11T..."}
  ]
}
```

**Terminée :**
```json
{
  "id": "m-1741700000000-abc123",
  "command": "Liste les 5 fichiers...",
  "status": "success",
  "result": "Voici les 5 fichiers les plus gros...",
  "duration": 8421,
  "models": ["glm-4.6", "llama3.2:3b"],
  "completedAt": "2026-03-11T14:30:00.000Z"
}
```

**Statuts possibles :** `pending` → `running` → `success` | `error`

---

### `GET /api/missions` — Historique paginé

```bash
curl "http://localhost:3000/api/missions?page=1&limit=10"
```

```json
{
  "missions": [...],
  "total": 47,
  "page": 1,
  "limit": 10
}
```

---

### `GET /api/status` — État du système

```bash
curl http://localhost:3000/api/status
```

```json
{
  "status": "online",
  "mode": "standalone",
  "version": "3.2.0",
  "uptime": 3600,
  "ollama": {
    "ok": true,
    "latencyMs": 12,
    "host": "http://localhost:11434"
  },
  "missions": {
    "total": 47,
    "success": 45,
    "active": 1
  },
  "models": {
    "strategist": "glm-4.6",
    "architect": "qwen3-coder",
    "worker": "llama3.2:3b",
    "vision": "llava:7b"
  }
}
```

---

### `GET /api/agents` — Liste des agents

```bash
curl http://localhost:3000/api/agents
```

```json
{
  "agents": [
    {"role": "strategist", "model": "glm-4.6", "status": "active"},
    {"role": "architect",  "model": "qwen3-coder", "status": "active"},
    {"role": "worker",     "model": "llama3.2:3b", "status": "active"},
    {"role": "vision",     "model": "llava:7b", "status": "active"}
  ]
}
```

---

### `POST /api/search` — Recherche dans l'historique

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "fichiers JavaScript"}'
```

```json
{
  "query": "fichiers JavaScript",
  "results": [
    {
      "id": "m-...",
      "command": "Liste les fichiers JS...",
      "status": "success",
      "score": 1.0
    }
  ],
  "count": 3
}
```

---

## Utilisation depuis le dashboard

Le dashboard (port 8080) est configuré pour envoyer les missions directement à l'API standalone sur le port 3000.

Démarrez les deux services :

```bash
# Terminal 1 — LaRuche API
STANDALONE_MODE=true node src/queen_oss.js

# Terminal 2 — Dashboard
cd dashboard && npm run dev
```

Ouvrez `http://localhost:8080` — le formulaire **NOUVELLE MISSION** est disponible en haut de la page centrale.

---

## Mise à jour en temps réel

Les événements de mission sont diffusés via WebSocket sur le port 9001 :

```javascript
const ws = new WebSocket("ws://localhost:9001");
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // Types : mission_start, thinking, plan_ready, task_start, task_done, mission_complete, mission_error
  console.log(event.type, event.missionId);
};
```

---

## Tests automatiques

```bash
# Suite complète (smoke + E2E standalone)
bash scripts/test-all.sh

# E2E standalone seulement
API_PORT=3001 node test/e2e/standalone.test.js

# Tests Playwright (dashboard requis)
npx playwright test test/e2e/dashboard.spec.js
```

---

## Exemple complet avec polling

```javascript
// Envoyer une mission et attendre le résultat
async function runMission(command) {
  const API = "http://localhost:3000";

  // 1. Envoyer
  const { missionId } = await fetch(`${API}/api/mission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  }).then(r => r.json());

  console.log(`Mission démarrée: ${missionId}`);

  // 2. Polling jusqu'à complétion
  while (true) {
    await new Promise(r => setTimeout(r, 1000));
    const mission = await fetch(`${API}/api/missions/${missionId}`).then(r => r.json());
    console.log(`Statut: ${mission.status}`);

    if (mission.status === "success") {
      console.log("Résultat:", mission.result);
      break;
    }
    if (mission.status === "error") {
      console.error("Erreur:", mission.error);
      break;
    }
  }
}

await runMission("Liste les fichiers du projet courant");
```

---

## Codes d'erreur

| Code HTTP | Description |
|-----------|-------------|
| 202 | Mission acceptée (asynchrone) |
| 400 | Body invalide ou `command` manquant |
| 404 | Mission introuvable |

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `STANDALONE_MODE` | `false` | Active le mode standalone |
| `API_PORT` | `3000` | Port de l'API REST |
| `CORS_ORIGIN` | `*` | Origines CORS autorisées |
| `HUD_PORT` | `9001` | Port WebSocket HUD |
| `LOG_LEVEL` | `info` | Niveau de log |
