# LaRuche OSS — OS Agent Local v4.1

## Vision
LaRuche est un **OS Agent multi-agents 100% local** qui transforme un Mac en ruche IA autonome.
Zéro cloud requis, zéro coût token, vie privée totale. Les agents s'exécutent via Ollama.

## Architecture
```
Queen (queen_oss.js)
├── API REST Hono :3000
├── WebSocket HUD :9001
├── Dashboard SaaS React :3001
├── Butterfly Loop (plan → parallèle → synthèse)
├── Computer Use (intentPipeline → skills macOS natifs)
└── Skills System (dynamic + builtins)
```

## Agents
| Role | Modèle | Usage |
|------|--------|-------|
| Stratège | llama3:latest | Planification, décomposition |
| Architecte | llama3.2:3b | Code, debug, architecture |
| Ouvrière | llama3.2:3b | Micro-tâches parallèles |
| Vision | llava:7b | Analyse écrans, images |
| VisionRapide | moondream:latest | Screenshots rapides |
| Synthèse | llama3:latest | Fusion résultats |

## APIs disponibles
- POST /api/mission — Lance une mission (retourne missionId)
- GET /api/missions/:id — Statut temps réel
- GET /api/agents — État de l'essaim
- GET /api/system — CPU/RAM/Disque
- GET /api/logs — Logs queen
- GET /api/skills — Skills disponibles
- GET /api/status — Status global

## Patterns importants

### Lancer la queen
```bash
cd /Users/wiaamhadara/LaRuche
STANDALONE_MODE=true node src/queen_oss.js
```

### Lancer le dashboard
```bash
cd dashboard && npm run dev -- --port 3001
```

### Tester une mission
```bash
curl -X POST http://localhost:3000/api/mission \
  -H "Content-Type: application/json" \
  -d '{"command": "ta mission ici"}'
```

## Optimisations actives
- `keep_alive: -1` → modèles restent en RAM
- `top_k: 20` → 50% moins de calcul par token
- `f16_kv: true` → 2x moins de RAM pour KV cache
- Fast path < 80 chars → 1 appel LLM (≈1.3s)
- `num_predict: 700` → stoppe sur-génération

## Computer Use
Détection automatique via `isComputerUseIntent()`. Active pour :
"ouvre ...", "lance ...", "prends un screenshot", "va sur ...", "tape ...", "clique ..."

## Modèles Ollama disponibles
llava:7b, llama3.2:3b, llama3:latest, moondream:latest, llama3.2-vision:latest
+ Cloud (lents) : glm-4.6:cloud, qwen3-coder:480b-cloud, glm-4.6:cloud

## Stack
- Runtime: Node.js 20+ ESM
- API: Hono + @hono/node-server
- WebSocket: ws
- Frontend: React 18 + Vite 5
- Tests: Jest (ESM) + smoke tests maison
- Python: pyautogui, PIL, aiohttp (vision)
