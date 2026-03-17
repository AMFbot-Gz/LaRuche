# Skill: Injection de router FastAPI dans agent existant

## Pattern
```python
# Dans le service (ex: n8n_service.py)
from fastapi import APIRouter
router = APIRouter(prefix="/n8n", tags=["n8n"])

@router.get("/health")
def health(): return {"ok": True}

# Dans l'agent principal (ex: executor_agent.py)
from services.n8n_service import router as n8n_router
app.include_router(n8n_router)
```

## Gotchas
- Importer après la création de `app = FastAPI()`
- Le prefix du router s'ajoute aux routes existantes
- Tester avec `python3 -m py_compile service.py` avant d'inclure
