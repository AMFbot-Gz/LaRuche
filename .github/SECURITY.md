# Politique de Sécurité — LaRuche

## Versions supportées

| Version | Support sécurité |
|---------|-----------------|
| 3.2.x   | ✅ Supportée |
| < 3.0   | ❌ Non supportée |

## Signaler une vulnérabilité

**Ne créez PAS d'issue publique pour les vulnérabilités de sécurité.**

Utilisez [GitHub Private Vulnerability Reporting](https://github.com/AMFbot-Gz/LaRuche/security/advisories/new).

Nous accuserons réception sous 48h et publierons un correctif selon la sévérité :
- **Critique** : 7 jours
- **Haute** : 30 jours  
- **Moyenne/Basse** : 90 jours

## Périmètre

### Dans le périmètre
- Injection de commandes via le sandbox terminal
- Bypass d'authentification Telegram
- Path traversal dans les tools MCP
- Exposition de secrets/tokens

### Hors périmètre
- Vulnérabilités dans Ollama (reportez-les à [ollama/ollama](https://github.com/ollama/ollama))
- Attaques nécessitant un accès physique à la machine

## Mesures de sécurité en place

- **Sandbox terminal** : patterns bloqués (`rm -rf /`, fork bomb, etc.)
- **Auth Telegram** : vérification ADMIN_TELEGRAM_ID sur chaque message
- **HITL** : approbation humaine pour les actions irréversibles
- **Audit trail** : `.laruche/logs/terminal.log`
- **Pas de secrets en clair** : `.env` exclus du git
