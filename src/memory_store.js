/**
 * memory_store.js - Stockage actif des expériences dans MEMORY.md + vault
 *
 * Appelé après chaque mission/pipeline pour enrichir la mémoire longue durée.
 * Extrait les patterns importants et les fusionne dans workspace/memory/MEMORY.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MEMORY_PATH = join(ROOT, "workspace/memory/MEMORY.md");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

// --- Lecture/écriture MEMORY.md ----------------------------------------------

function loadMemory() {
  if (!existsSync(MEMORY_PATH)) return { raw: "", entries: [] };
  const raw = readFileSync(MEMORY_PATH, "utf-8");
  return { raw };
}

function appendMemory(entry) {
  const mem = loadMemory();
  const timestamp = new Date().toISOString().split("T")[0];

  const newBlock = `
---
\`\`\`yaml
id: mem_${Date.now()}
type: ${entry.type || "rule"}
scope: ${entry.scope || "global"}
tags: [${(entry.tags || []).join(", ")}]
created: ${timestamp}
confidence: ${entry.confidence || "medium"}
\`\`\`
${entry.content}
`;

  const currentContent = mem.raw || "# LaRuche Memory

";
  writeFileSync(MEMORY_PATH, currentContent + newBlock);
}

// --- Extraction de leçon via LLM ---------------------------------------------

async function extractLesson(mission) {
  const { goal, steps, success, duration } = mission;
  if (!steps || steps.length === 0) return null;

  const failedSteps = steps.filter(s => s.result?.success === false);
  if (success && failedSteps.length === 0) return null;

  const prompt = `Une mission LaRuche vient de se terminer. Objectif: ${goal} Succès: ${success} Étapes: ${steps.map(s => `${s.step?.skill}(${JSON.stringify(s.step?.params || {})}) -> ${s.result?.success !== false ? "OK" : "ECHEC: " + (s.result?.error || "?")}`).join(", ")} Durée: ${(duration / 1000).toFixed(1)}s Si cette mission a échoué ou pourrait être améliorée, quelle règle générale peut-on en déduire? Sinon, SKIP.`;

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.2:3b", prompt, stream: false, options: { temperature: 0.3 } }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    const lesson = data.response?.trim();
    if (!lesson || lesson === "SKIP" || lesson.toLowerCase().includes("skip")) return null;
    return lesson;
  } catch {
    return null;
  }
}

// --- API principale with Debounce logic --------------------------------------

let _lastStoredMissionId = null;
let _storageTimeout = null;

export async function storeMissionMemory(mission) {
  // Prevent duplicate storage of the same mission result within 2 seconds
  const missionId = `${mission.goal}_${mission.success}_${mission.steps?.length}`;
  if (_lastStoredMissionId === missionId) return;

  if (_storageTimeout) clearTimeout(_storageTimeout);

  _storageTimeout = setTimeout(async () => {
    _lastStoredMissionId = missionId;
    try {
      // 1. Stocker dans vault (ChromaDB)
      const { execa } = await import("execa");
      const rpc = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "storeExperience",
          arguments: {
            task: mission.goal || "",
            result: JSON.stringify(mission.steps?.slice(0, 3) || []).slice(0, 200),
            success: mission.success !== false,
            skillUsed: mission.steps?.[0]?.step?.skill || "unknown",
          },
        },
      });

      await execa("node", [join(ROOT, "mcp_servers/vault_mcp.js")], {
        input: rpc,
        cwd: ROOT,
        timeout: 10000,
        reject: false,
      }).catch(() => {});

      // 2. Extraire leçon et stocker dans MEMORY.md
      const lesson = await extractLesson(mission);
      if (lesson) {
        mkdirSync(join(ROOT, "workspace/memory"), { recursive: true });
        appendMemory({
          type: "error_lesson",
          scope: "global",
          tags: ["auto-learned", "pipeline"],
          confidence: "medium",
          content: lesson,
        });
      }
    } catch { /* non-fatal */ }
  }, 1000);
}

export async function storeRule(rule, tags = [], scope = "global") {
  appendMemory({ type: "rule", scope, tags, confidence: "high", content: rule });
}
