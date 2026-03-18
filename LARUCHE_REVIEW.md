# LaRuche — Review architecturale — 2026-03-18

> Rédigée par Claude (claude-sonnet-4-6) après lecture exhaustive du codebase.
> Aucun fichier de code n'a été modifié. Seulement lire, analyser, conclure.

---

## Score actuel

| Dimension | Score | Justification |
|---|---|---|
| **Maintenabilité** | **4/10** | 103 fichiers JS sans un seul test, deux ComputerUseLoop, moltbot pollue le monorepo |
| **Performance** | **5/10** | 11 sauts HTTP par mission, NeuralEventBus non-scalable, aucun benchmark |
| **Clarté du concept** | **3/10** | Trois identités produit en un repo, SaaS vs agent local = contradiction structurelle |
| **Prêt pour prod** | **2/10** | ANTHROPIC_API_KEY vide, 0 tests Node, ApiKey en clair, pas de déploiement Railway/Vercel |

---

## Problèmes critiques — bloquer le déploiement

### 🔴 1. `apps/gateway/` n'est pas du code LaRuche

C'est **moltbot** — un projet WhatsApp/multi-canal CLI entièrement séparé :

```json
{
  "name": "moltbot",
  "version": "2026.1.29",
  "description": "WhatsApp gateway CLI (Baileys web) with Pi RPC agent"
}
```

2502 fichiers TypeScript. Telegram, Discord, LINE, WhatsApp, Signal, iMessage, Slack, canvas, daemon, TUI, wizard, ACP, plugin-SDK... C'est un produit à part entière, pas une gateway LaRuche.

**Impact concret** :
- Fausse toutes les métriques ("combien de fichiers dans LaRuche ?")
- Le CI/CD tourne des tests sur du code qui n'a rien à voir
- Quand un dev ouvre le repo, il ne sait pas où est LaRuche vs moltbot
- Tout déploiement cloud inclura ~85% de code hors-scope

**Solution** : Sortir moltbot dans son propre repo. Il est déjà suffisamment mature (2026.1.29).

---

### 🔴 2. Deux ComputerUseLoop dans le même fichier

`apps/queen/src/queen_oss.js` lignes 34-35 :

```javascript
import { ComputerUseLoop } from './services/computer_use_loop.js';
import { ComputerUseLoop as ComputerUseLoopSimple, setupComputerUseRoutes } from './computer_use_loop.js';
```

Puis utilisés à deux endroits différents dans le même fichier :
- Ligne 719 : `new ComputerUseLoop({ eventBus, hitlManager })` — version "avancée"
- Ligne 790 : `new ComputerUseLoopSimple({ log: logger })` — version "simple"

Ce sont deux implémentations divergentes du même concept. L'une utilise le bus d'événements et HITL, l'autre non. **Il est impossible de savoir laquelle est canonique** sans lire les deux fichiers complets.

**Impact concret** : Comportement imprévisible selon quel chemin de code est emprunté. Bugs silencieux. Régression impossible à tracer.

---

### 🔴 3. Zéro test sur 103 fichiers JavaScript

`apps/queen/src/` contient 103 fichiers `.js` dans 51 répertoires. Tests Jest : **0**.

C'est le cœur du système. La Queen orchestre tout — missions, Telegram, WebSocket, billing, Computer Use, HITL, cron. Pas un seul test.

**Ce que ça signifie en pratique** : chaque déploiement est un déploiement en aveugle. Une régression dans `missions.js` (957 LOC) ou `mcp_routes.js` (1134 LOC) ne sera détectée qu'en production.

Le paradoxe : 430 tests Python passants pour les agents périphériques, 0 test pour l'orchestrateur central.

---

### 🔴 4. Le modèle SaaS est structurellement incohérent

Stripe FREE/PRO($19)/TEAMS($79) suppose que l'utilisateur achète **un service hébergé**. Il paie, il clique, ça marche.

Mais LaRuche nécessite, côté utilisateur, **une installation locale** :
- 11 agents Python (`uv`, `pyproject.toml`, FastAPI :8001-:8011)
- Ollama + 4-7 GB de modèles téléchargés
- Docker optionnel
- Variables d'environnement dans `.env`
- ChromaDB, Redis

Un utilisateur qui paie $19/mois via Clerk + Stripe ne peut **pas utiliser le service** sans un setup technique de 30-60 minutes sur sa machine. Ce n'est pas un SaaS. C'est un logiciel open source avec une page de paiement.

**Deux produits valides auraient du sens :**
- **LaRuche Open** : agent local, open source, gratuit, installe-toi-même
- **LaRuche Cloud** : agent hébergé côté serveur, Railway + Neon + Vercel, $19/mois réel

Aujourd'hui c'est un hybride qui ne satisfait ni l'un ni l'autre.

---

### 🔴 5. `ANTHROPIC_API_KEY` vide = Computer Use non-fonctionnel

Le `.env` actuel a `ANTHROPIC_KEY` vide (crédits épuisés). `ComputerUseLoop` utilise Claude Vision pour interpréter les screenshots. Sans clé, tout passe en mode Ollama dégradé — et le mode Ollama n'a pas de vision fiable pour du Computer Use.

La feature principale du produit (prendre le contrôle du Mac par IA) est **non-fonctionnelle** en l'état.

---

## Problèmes importants — corriger cette semaine

### 🟠 6. `queen_oss.js` — monolithe 959 LOC sans cohérence interne

Le fichier importe 20 modules différents et mélange dans le même fichier :
- Gestion mémoire TTL
- Init du swarm
- Config Telegram
- Démarrage des WebSocket servers
- Routing des commandes
- Computer Use
- Cron runner
- Health monitoring

C'est une God Class Node.js. Chaque nouvelle feature y est ajoutée par concatenation. Le nom `queen_oss.js` ("Open Source Edition") suggère que c'est une version allégée d'une queen privée — mais il n'y a pas de version privée. Le suffixe `_oss` est une fausse complexité.

**Solution** : `src/queen.js` de 150 LOC max qui importe et compose. Les services restent dans leurs fichiers.

---

### 🟠 7. 11 agents Python pour 4 responsabilités réelles

Les 11 agents (:8001-:8011) mappent sur 4 domaines fonctionnels :

| Domaine | Agents actuels |
|---|---|
| **Penser** | brain, orchestration |
| **Voir** | perception |
| **Agir** | executor, computer_use (dans queen) |
| **Se souvenir** | memory, knowledge |

`discovery`, `goals`, `mcp-bridge`, `voice` sont des features, pas des agents autonomes. Chaque agent = un processus Python, un port, un `pyproject.toml`, un Dockerfile, des tests. Multiplié par 11 = 11x la charge de maintenance.

**Un seul agent FastAPI avec des routers séparés par domaine** aurait les mêmes capacités avec 80% moins de complexité d'infra.

---

### 🟠 8. `ApiKey` stockée en clair dans Prisma

```prisma
model ApiKey {
  key  String @unique  // stocké en clair
}
```

Si la base de données est compromise, toutes les clés API de tous les utilisateurs sont exposées. Un hash HMAC-SHA256 avec un secret fixe suffit.

---

### 🟠 9. `NeuralEventBus` in-process = scalabilité zéro

Le bus d'événements est en mémoire dans le process Node. Deux instances Queen = deux bus indépendants. Pas de pub/sub cross-process. Acceptable pour un seul utilisateur sur une seule machine, bloquant dès qu'on scale horizontalement.

---

### 🟠 10. `.venv` dans le repo + `wc -l` pollué

Les outils de comptage de lignes incluent `.venv` (20k+ lignes AppKit metadata, etc.). Le `.venv` ne devrait pas être dans le repo (`.gitignore` à compléter). Impact : les métriques du projet sont fausses, le repo pèse inutilement.

---

## Ce qui est bien fait — ne pas toucher

**Sandbox AST (agents/evolution/)** : liste blanche d'imports + blocage `open/eval/exec/__builtins__` + rlimit CPU/RAM. C'est la bonne approche. Une liste noire aurait été contournée.

**MemoryManager TTL dans queen_oss.js** : cache interne avec expiration et purge périodique. Pattern correct pour éviter les fuites sur une longue durée de vie.

**Architecture agents Python** : chaque agent = FastAPI isolé avec ses propres tests. La séparation est trop granulaire (11 agents), mais le pattern lui-même est bon. Les 430 tests passants le prouvent.

**Sécurité WebSocket** : rate limit 10 cmd/s, `timingSafeEqual` pour le token, timeout 60s inactivité, max message 64 Ko. Fait proprement.

**CI/CD** : 5 jobs parallèles, tests bloquants avant build, lint Python + lint Node séparés. La pipeline est correcte.

**Resilient fetch** : retry exponentiel sur les appels inter-agents. Pas d'appels naïfs HTTP qui crashent au premier timeout.

**Clio mémoire** : 17 KB de contexte architectural tracé session par session. Rare et précieux.

---

## Architecture recommandée

Si on repart avec les contraintes actuelles (Node.js, Python, Ollama, Telegram, Mac M2) :

```
LaRuche/
├── agent/                    ← UN agent Python (FastAPI, 4 routers)
│   ├── routers/
│   │   ├── brain.py          ← LLM routing (Ollama / Claude)
│   │   ├── perception.py     ← screenshot + OCR + vision
│   │   ├── executor.py       ← shell + HID + Computer Use
│   │   └── memory.py         ← ChromaDB + épisodes
│   ├── sandbox.py            ← AST whitelist (conservé tel quel)
│   └── tests/                ← 200+ tests unitaires
│
├── queen/                    ← Node.js orchestrateur (max 500 LOC)
│   ├── index.js              ← boot + compose
│   ├── router.js             ← routing intent → agent
│   ├── telegram.js           ← Telegraf uniquement
│   ├── websocket.js          ← Dashboard WS
│   └── billing.js            ← Stripe (si SaaS cloud uniquement)
│
├── dashboard/                ← Next.js (conserver l'existant)
│
└── infra/
    ├── docker-compose.yml    ← agent + ollama + chromadb + redis
    └── deploy/               ← Railway + Vercel configs
```

**Ce qui disparaît** :
- moltbot (→ son propre repo)
- 10 des 11 agents Python (→ routers dans un seul FastAPI)
- `NeuralEventBus` (→ appels HTTP directs suffisent à ce stade)
- Turborepo (→ justifié seulement quand il y a 3+ apps actives)

**Résultat** : même fonctionnalité, 70% moins de fichiers, 100% testable.

---

## Feature manquante la plus impactante

**Replay mission pas à pas avec screenshots.**

Quand LaRuche exécute une mission en 12 étapes sur macOS, l'utilisateur ne voit qu'un résultat final. Il ne sait pas ce que l'agent a fait, dans quel ordre, avec quelles décisions intermédiaires.

Un replay chronologique `[t=0s screenshot] → [thought] → [action: click(x,y)] → [t=3s screenshot]` transforme l'agent opaque en agent transparent. C'est la différence entre "j'espère que ça a marché" et "je comprends ce que mon agent fait".

C'est aussi le meilleur outil de debug, le meilleur argument de vente, et la feature qui rend les utilisateurs évangélistes. Aucun concurrent direct (n8n, Make, Zapier) ne fait du Computer Use avec replay visuel.

L'infrastructure existe déjà : screenshots dans `AgentSession.screenshots[]`, logs dans `logs[]`. Il manque une page Dashboard `/sessions/:id/replay` avec timeline.

---

## Verdict : déployer maintenant ou refactorer d'abord ?

**Refactorer d'abord. Ne pas déployer.**

Pas pour des raisons esthétiques. Pour trois raisons concrètes :

1. **moltbot dans apps/gateway/** : déployer sur Railway tel quel = déployer 2502 fichiers TypeScript d'un projet WhatsApp non maintenu par toi dans l'image Docker de LaRuche. Coût infra, surface d'attaque, confusion de logs.

2. **0 tests Node + deux ComputerUseLoop** : le premier incident en production sera impossible à debugger. Tu ne sauras pas quelle implémentation a été appelée, ni si le bug est dans la queen ou dans un agent.

3. **Modèle SaaS incohérent** : mettre Stripe en prod sans clarifier si le produit est local ou cloud revient à collecter de l'argent pour un service qu'on ne peut pas délivrer. Risque légal et réputation.

**Ce qui débloque en 1 semaine** (ordre de priorité) :

```
1. Sortir moltbot → son propre repo (2h)
2. Supprimer le double ComputerUseLoop → garder services/computer_use_loop.js (1h)
3. Décider : SaaS cloud OU agent local. Pas les deux. (décision, pas du code)
4. 30 tests Jest sur queen_oss.js (missions, websocket, billing) (1 journée)
5. Recharger crédits Anthropic (5 min, sans ça Computer Use est cassé)
```

Après ça, un déploiement Railway + Vercel en 2h. Pas avant.

---

*Review réalisée sans modification du code — lecture seule.*
*Scope : `apps/queen/` (103 JS files), `agents/` (11 FastAPI), `apps/gateway/` (2502 TS files), `packages/`, `infra/`.*
*Date : 2026-03-18*
