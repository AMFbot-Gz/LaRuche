# Skill: N8N Workflow Import via Docker

## Quand l'utiliser
Quand tu dois charger des workflows N8N dans un container Docker sans accès UI.

## Pattern
```bash
# Copier le fichier JSON dans le container
docker cp workflow.json n8n-container:/tmp/workflow.json

# Importer via CLI n8n
docker exec n8n-container n8n import:workflow --input=/tmp/workflow.json

# Vérifier
docker exec n8n-container n8n list:workflow
```

## Format JSON minimal pour N8N v1.x
```json
{
  "name": "Workflow Name",
  "nodes": [...],
  "connections": {},
  "settings": {"executionOrder": "v1"},
  "active": false
}
```

## Gotchas
- `active: false` pour import, activer manuellement après vérification
- Les credentials doivent être créés séparément dans l'UI N8N
- Utiliser des expressions `={{ $env.VAR }}` pour les variables d'env
- Les UUIDs de nodes doivent être uniques dans le workflow
