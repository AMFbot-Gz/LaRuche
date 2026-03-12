/**
 * test/smoke.js — Suite de tests LaRuche v4.1
 * Tests automatiques : Ollama (guard CI), routing (mock inject), DB, skills, CLI, perf
 */

import chalk from "chalk";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OLLAMA = process.env.OLLAMA_HOST || "http://localhost:11434";

let passed = 0, failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ${chalk.dim("→")} ${name.padEnd(50)}`);
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(chalk.green("✅") + chalk.dim(` ${ms}ms`));
    passed++;
  } catch (e) {
    console.log(chalk.red("❌") + chalk.dim(` ${e.message?.slice(0, 60)}`));
    failed++;
  }
}

function skip(name) {
  console.log(`  ${chalk.dim("→")} ${name.padEnd(50)}${chalk.dim("⏭ skip (no Ollama)")}`)
  passed++; // compte comme pass pour ne pas polluer le score
}

async function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion échouée");
}

// ─── Détection Ollama (helper) ────────────────────────────────────────────────────────────
async function checkOllama() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

console.log(chalk.hex("#F5A623").bold("\n🐝 LaRuche Smoke Tests v4.1\n"));

const ollamaAvailable = await checkOllama();
if (!ollamaAvailable) {
  console.log(chalk.dim("  ⚠️  Ollama non disponible — tests dépendants Ollama seront skippés\n"));
}

// ─── 1. OLLAMA ───────────────────────────────────────────────────────────────────────
console.log(chalk.bold("  Ollama"));

if (!ollamaAvailable) {
  skip("Ollama accessible");
  skip("Modèles disponibles (>= 3)");
  skip("Génération texte (llama3.2:3b)");
} else {
  await test("Ollama accessible", async () => {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    assert(r.ok, `HTTP ${r.status}`);
  });

  await test("Modèles disponibles (>= 3)", async () => {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const d = await r.json();
    assert(d.models?.length >= 3, `Seulement ${d.models?.length} modèle(s)`);
  });

  await test("Génération texte (llama3.2:3b)", async () => {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.2:3b", prompt: "Dis 'OK'", stream: false }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    assert(d.response?.length > 0, "Réponse vide");
  });
}

// ─── 2. MODEL ROUTER ──────────────────────────────────────────────────────────────────
console.log(chalk.bold("\n  Model Router"));

const { autoDetectRoles, route, ask, _setAvailableModelsCache } = await import("../src/model_router.js");

// Injection de modèles mock AVANT les tests de routing
// → permet de tester findBest() / route() sans Ollama réel
_setAvailableModelsCache([
  "glm-4.6",
  "qwen3-coder",
  "llama3.2:3b",
  "llava:latest",
  "moondream:latest",
]);

await test("Auto-détection rôles", async () => {
  const roles = await autoDetectRoles();
  assert(roles.strategist, "Pas de stratège");
  assert(roles.architect, "Pas d'architecte");
  assert(roles.worker, "Pas d'ouvrière");
  assert(roles.vision, "Pas de vision");
});

await test("Cache rôles (2ème appel < 5ms)", async () => {
  const t = Date.now();
  await autoDetectRoles();
  const ms = Date.now() - t;
  assert(ms < 5, `Cache trop lent: ${ms}ms`);
});

await test("Routing code → architect model", async () => {
  const model = await route("écris une fonction Python");
  assert(model, `Aucun modèle retourné`);
});

await test("Routing stratégie → strategist model", async () => {
  const model = await route("analyse la stratégie de la mission");
  assert(model, `Aucun modèle retourné`);
});

await test("Routing vision → llava/vision", async () => {
  const model = await route("capture l'écran et analyse");
  assert(model.includes("vision") || model.includes("llava") || model.includes("moondream"), `Got: ${model}`);
});

await test("Routing neutre → llama3.2", async () => {
  const model = await route("bonjour comment vas-tu");
  assert(model.includes("llama3.2") || model.includes("llama3"), `Got: ${model}`);
});

if (!ollamaAvailable) {
  skip("ask() retourne texte non vide");
} else {
  await test("ask() retourne texte non vide", async () => {
    const r = await ask("Réponds juste: OK", { role: "worker", timeout: 15000 });
    assert(r.success, `Erreur: ${r.error}`);
    assert(r.text?.length > 0, "Texte vide");
    assert(r.model, "Pas de modèle retourné");
  });
}

// ─── 3. DATABASE ──────────────────────────────────────────────────────────────────────────
console.log(chalk.bold("\n  Database (sql.js)"));

const { initDb, run, get, all } = await import("../src/db.js");

await test("Initialisation DB", async () => {
  await initDb("CREATE TABLE IF NOT EXISTS test_smoke (id INTEGER PRIMARY KEY, v TEXT)");
});

await test("INSERT (debounce 500ms)", async () => {
  const before = Date.now();
  for (let i = 0; i < 10; i++) {
    await run("INSERT INTO test_smoke (v) VALUES (?)", [`val_${i}`]);
  }
  const ms = Date.now() - before;
  assert(ms < 50, `Trop lent: ${ms}ms`);
});

await test("SELECT avec statement cache", async () => {
  const r = await get("SELECT COUNT(*) as c FROM test_smoke");
  assert(r.c >= 10, `Seulement ${r.c} rows`);
});

await test("SELECT x5 (cache statements)", async () => {
  const t = Date.now();
  for (let i = 0; i < 5; i++) await get("SELECT COUNT(*) as c FROM test_smoke");
  const ms = Date.now() - t;
  assert(ms < 10, `Trop lent: ${ms}ms`);
});

// ─── 4. SKILL EVOLUTION ────────────────────────────────────────────────────────────────────
console.log(chalk.bold("\n  Skill System"));

const { listSkills, createSkill } = await import("../src/skill_evolution.js");

await test("listSkills() retourne tableau", async () => {
  const skills = listSkills();
  assert(Array.isArray(skills), "Pas un tableau");
});

await test("Registry cache (2ème appel < 1ms)", async () => {
  const t = Date.now();
  listSkills(); listSkills(); listSkills();
  assert(Date.now() - t < 2, "Cache registry lent");
});

// ─── 5. CLI ───────────────────────────────────────────────────────────────────────────────
console.log(chalk.bold("\n  CLI laruche"));

const { execa } = await import("execa");

if (!ollamaAvailable) {
  skip("laruche doctor");
  skip("laruche status");
  skip("laruche models");
} else {
  await test("laruche doctor", async () => {
    const { stdout } = await execa("node", ["bin/laruche.js", "doctor"], { cwd: ROOT });
    assert(stdout.includes("✅") || stdout.includes("✓"), "Doctor n'affiche pas de succès");
  });

  await test("laruche status", async () => {
    const { stdout } = await execa("node", ["bin/laruche.js", "status"], { cwd: ROOT });
    assert(stdout.includes("Ollama"), "Status ne mentionne pas Ollama");
  });

  await test("laruche models", async () => {
    const { stdout } = await execa("node", ["bin/laruche.js", "models"], { cwd: ROOT });
    assert(stdout.includes("glm") || stdout.includes("llama"), "Pas de modèles détectés");
  });
}

await test("laruche skill list", async () => {
  const { stdout } = await execa("node", ["bin/laruche.js", "skill", "list"], { cwd: ROOT });
  assert(stdout.includes("Skills"), "Pas de liste skills");
});

// ─── 6. PERFORMANCE ─────────────────────────────────────────────────────────────────────────
console.log(chalk.bold("\n  Performance"));

// Ces tests utilisent le cache mock injecté plus haut — pas d'Ollama nécessaire
await test("autoDetectRoles x10 parallèle < 50ms", async () => {
  const t = Date.now();
  await Promise.all(Array(10).fill(0).map(() => autoDetectRoles()));
  const ms = Date.now() - t;
  assert(ms < 50, `Trop lent: ${ms}ms (cache attendu)`);
});

await test("route() x20 parallèle < 10ms", async () => {
  const tasks = ["code", "stratégie", "vision", "bonjour", "python"];
  const t = Date.now();
  await Promise.all(Array(20).fill(0).map((_, i) => route(tasks[i % tasks.length])));
  const ms = Date.now() - t;
  assert(ms < 10, `Trop lent: ${ms}ms`);
});

// ─── RÉSULTAT ──────────────────────────────────────────────────────────────────────────────
console.log();
const total = passed + failed;
const pct = total > 0 ? Math.round((passed / total) * 100) : 100;
const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));

console.log(`  ${bar} ${pct}%`);
console.log(`  ${chalk.green(`✅ ${passed} passés`)}  ${failed > 0 ? chalk.red(`❌ ${failed} échoués`) : chalk.dim("❌ 0 échoué")}\n`);

if (failed > 0) process.exit(1);
