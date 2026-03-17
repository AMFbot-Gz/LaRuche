"""
n8n_service.py — Intégration N8N dans La Ruche

Permet à La Ruche de :
- Lister les workflows N8N actifs
- Déclencher un workflow par nom ou ID
- Créer un nouveau workflow simple via API
- Recevoir des déclencheurs depuis N8N (webhook)
"""
import os, json
import httpx
from fastapi import APIRouter

N8N_URL = os.environ.get("N8N_URL", "http://localhost:5678")
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")

router = APIRouter(prefix="/n8n", tags=["n8n"])

async def _n8n_headers():
    if N8N_API_KEY:
        return {"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"}
    return {"Content-Type": "application/json"}

@router.get("/workflows")
async def list_workflows():
    """Liste tous les workflows N8N actifs."""
    async with httpx.AsyncClient(timeout=10.0) as c:
        resp = await c.get(f"{N8N_URL}/api/v1/workflows", headers=await _n8n_headers())
        return resp.json()

@router.post("/trigger/{workflow_name}")
async def trigger_workflow(workflow_name: str, data: dict = {}):
    """Déclenche un workflow N8N par webhook ou nom."""
    # Essayer d'abord par webhook URL
    webhook_url = f"{N8N_URL}/webhook/{workflow_name}"
    async with httpx.AsyncClient(timeout=30.0) as c:
        try:
            resp = await c.post(webhook_url, json=data)
            return {"status": "triggered", "workflow": workflow_name, "response": resp.json()}
        except Exception as e:
            return {"status": "error", "message": str(e)}

@router.post("/create")
async def create_workflow(name: str, description: str, trigger_type: str = "webhook"):
    """Crée un workflow N8N simple."""
    workflow = {
        "name": name,
        "active": True,
        "nodes": [
            {
                "id": "trigger",
                "name": "Trigger",
                "type": f"n8n-nodes-base.{trigger_type}",
                "position": [240, 300],
                "parameters": {}
            },
            {
                "id": "http",
                "name": "Notifier La Ruche",
                "type": "n8n-nodes-base.httpRequest",
                "position": [460, 300],
                "parameters": {
                    "url": "http://localhost:3000/webhook/n8n",
                    "method": "POST",
                    "bodyParameters": {"parameters": [
                        {"name": "workflow", "value": name},
                        {"name": "description", "value": description}
                    ]}
                }
            }
        ],
        "connections": {"Trigger": {"main": [[{"node": "Notifier La Ruche", "type": "main", "index": 0}]]}}
    }
    async with httpx.AsyncClient(timeout=10.0) as c:
        resp = await c.post(
            f"{N8N_URL}/api/v1/workflows",
            json=workflow,
            headers=await _n8n_headers()
        )
        return resp.json()
