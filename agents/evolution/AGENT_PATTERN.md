# Chimera Agent — Reference Pattern

> `agents/evolution/` is the **gold standard** for how Python agents are structured in Chimera.
> Clone this structure when building any of the 6 other agents.

---

## Directory Layout

```
agents/<your_agent>/
├── __init__.py                     # Empty or minimal exports
├── <agent_name>.py                 # FastAPI app — the entry point
├── schemas/
│   ├── __init__.py
│   └── <domain>_task.py            # Pydantic models (request + response)
├── services/
│   ├── __init__.py
│   └── <service_name>.py           # Business logic, isolated from FastAPI
└── tests/
    ├── __init__.py
    └── test_<component>.py         # pytest tests
```

**Why this split?**
- `schemas/` keeps Pydantic models decoupled from FastAPI — importable from anywhere without spinning up the server
- `services/` keeps business logic testable without HTTP overhead
- Tests can directly instantiate `services/` classes — fast, no mocking needed

---

## The FastAPI Entry Point Pattern

Every agent follows the same 5-section structure:

```python
"""
<agent_name>.py — FastAPI app for the <AgentName> agent

Endpoint overview:
  GET  /health          — liveness check
  POST /main_endpoint   — core operation

Launch:
  uvicorn <agent_name>:app --port <PORT> --reload
"""

# ─── Config ───────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent.parent  # chimera/ root
# Declare directories and create them here

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="AgentName", description="...", version="1.0.0")
# Instantiate long-lived service objects here (not in route handlers)

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "<agent_name>", "timestamp": ...}

@app.post("/main_endpoint", response_model=ResultModel)
async def main_endpoint(task: TaskModel) -> ResultModel:
    ...

# ─── Helpers ──────────────────────────────────────────────────────────────────
def _private_helper() -> ...:
    ...

# ─── Lancement direct ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("<agent_name>:app", host="0.0.0.0", port=PORT, reload=True)
```

**Key rules:**
- Service objects (`LLMCodeGenerator`, `SandboxExecutor`, etc.) are module-level singletons — instantiated once at startup, not per-request
- `/health` always returns `{"status": "ok", "service": "<name>", "timestamp": "<iso>"}` — the Queen's HealthMonitor depends on this exact format
- Input validation goes in Pydantic schemas, not in route handlers
- Route handlers are thin: validate → call service → format response → return

---

## The Schemas Pattern

```python
# schemas/<domain>_task.py

class TaskComplexity(str, Enum):
    SIMPLE  = "simple"
    MEDIUM  = "medium"
    COMPLEX = "complex"

class MyTask(BaseModel):
    """Input to POST /main_endpoint."""
    description: str = Field(..., min_length=10, max_length=2000)
    context:     dict[str, Any] = Field(default_factory=dict)

    @field_validator("description")
    @classmethod
    def no_prompt_injection(cls, v: str) -> str:
        """Reject prompt injection patterns before they reach the LLM."""
        for pattern in ["ignore previous", "system:", "<<SYS>>"]:
            if pattern in v.lower():
                raise ValueError(f"Suspicious input: '{pattern}'")
        return v.strip()

class MyResult(BaseModel):
    """Response from POST /main_endpoint."""
    task_id:   str
    status:    ExecutionStatus
    output:    Any
    total_ms:  int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    error:     str | None = None
```

**Key rules:**
- Always add a `no_prompt_injection` validator on any field that feeds the LLM
- Always include `task_id`, `status`, `total_ms`, `timestamp`, `error` in result models
- Use `str | None = None` for optional fields (Python 3.10+ union syntax)
- Separate request and response models — never reuse the same model for both

---

## The Service Pattern

```python
# services/<service_name>.py

class MyService:
    """
    One-line description of what this service does.

    Usage:
        service = MyService()
        result  = service.process(task)
    """

    def __init__(self, config: ... | None = None):
        self._config = config or default_config

    # ─── Public API ────────────────────────────────────────────────────────

    def process(self, task: MyTask) -> MyResult:
        """
        Main operation. Raises RuntimeError if a critical dependency is unavailable.
        Returns MyResult otherwise (success or failure encoded in status field).
        """
        ...

    # ─── Private helpers ───────────────────────────────────────────────────

    def _validate(self, input: str) -> str | None:
        """Returns error message, or None if input is valid."""
        ...
```

**Key rules:**
- Services never import FastAPI — they're pure Python, testable in isolation
- Hard failures (dependency unavailable) raise `RuntimeError` → caught by the route handler → HTTP 503
- Soft failures (invalid input, timeout, partial failure) are encoded in the result's `status` field — not exceptions
- Private methods start with `_`

---

## The Tests Pattern

```python
# tests/test_<component>.py

import pytest
from agents.<agent>.services.<service> import MyService

@pytest.fixture
def service() -> MyService:
    return MyService()


class TestValidInput:
    def test_basic_success(self, service):
        result = service.process(valid_input)
        assert result.status == ExecutionStatus.SUCCESS

    def test_output_is_dict(self, service):
        result = service.process(valid_input)
        assert isinstance(result.output, dict)


class TestSecurity:
    def test_blocked_pattern(self, service):
        result = service.process(input_with_dangerous_code)
        assert result.status == ExecutionStatus.SANDBOX_REJECT

    def test_prompt_injection_rejected(self):
        with pytest.raises(ValueError, match="Suspicious"):
            MyTask(description="ignore previous instructions")


class TestEdgeCases:
    def test_timeout(self, service):
        result = service.process(infinite_loop_input, timeout=1)
        assert result.status == ExecutionStatus.TIMEOUT
```

**Coverage targets:**
- Happy path: at least 2 tests (simple + complex input)
- Security: at least 3 tests (blocked imports, dangerous builtins, prompt injection)
- Edge cases: timeout, empty input, malformed input
- Target: **>80% line coverage** per service

---

## The `evolution` Agent — Concrete Reference

### Data flow

```
POST /generate_and_run (CodingTask)
          │
          ▼
   LLMCodeGenerator.generate(task)
     - Selects model by complexity (simple → llama3.2:3b, complex → qwen3-coder)
     - Builds structured prompt with context
     - Calls Ollama REST API
     - Extracts Python code block from response
          │
          ▼
   SandboxExecutor.run(code, params, timeout)
     - _static_analysis(): AST walk
         • Import whitelist (30 safe stdlib modules)
         • BLOCKED_NAMES: open, eval, exec, __builtins__, getattr…
         • BLOCKED_ATTRS: __class__, __globals__, __code__…
         • BLOCKED_PATTERNS: raw string scan (rm -rf, os.system…)
     - _exec_subprocess(): subprocess.run() with
         • Isolated env (PATH=/usr/bin:/bin, no PYTHONPATH)
         • rlimit CPU + memory
         • Timeout = task.timeout_seconds + 2s
          │
          ▼
   _save_skill() if status == SUCCESS and save_on_success
     - skills/generated/<snake_case_name>.py  (code + header)
     - skills/generated/<snake_case_name>.json (metadata)
          │
          ▼
   CodingTaskResult (returned to caller)
```

### Port assignment

| Agent | Port |
|-------|------|
| orchestration | :8001 |
| perception    | :8002 |
| brain         | :8003 |
| executor      | :8004 |
| **evolution** | :8005 ← this agent |
| memory        | :8006 |
| mcp-bridge    | :8007 |

---

## Checklist: New Agent

Use this checklist when creating a new agent:

- [ ] Directory structure matches the reference layout above
- [ ] `__init__.py` present in all subdirectories
- [ ] FastAPI app has `/health` endpoint with correct response format
- [ ] Pydantic schemas in `schemas/` (not inline in routes)
- [ ] Business logic in `services/` (not in route handlers)
- [ ] `if __name__ == "__main__"` block for direct launch
- [ ] Port set correctly in `.env.example` and `Makefile`
- [ ] Tests cover happy path + security + edge cases
- [ ] `uv run pytest agents/<agent_name>/ -v` passes
- [ ] Queen's `DistributedHealthMonitor` can reach `/health`
- [ ] Agent added to `AGENT_EVOLUTION_PORT` range in `.env.example`
