# Skill: Health check multi-agents depuis Node.js

## Pattern
```javascript
const AGENTS = [{name: "brain", port: 8003}, ...]

async function checkAllAgents() {
  const results = await Promise.allSettled(
    AGENTS.map(async ({name, port}) => {
      const resp = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(3000)
      })
      return {name, port, ok: resp.ok}
    })
  )
  return results.map(r => r.status === 'fulfilled' ? r.value : {name: '?', ok: false})
}
```

## Gotchas
- `AbortSignal.timeout(ms)` disponible Node.js 17.3+
- `Promise.allSettled` ne rejette jamais (contrairement à `Promise.all`)
- Augmenter le timeout si les agents sont lents à démarrer (>5s au boot)
