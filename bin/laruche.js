#!/usr/bin/env node
/**
 * 🐝 LaRuche CLI v3.0
 * The sovereign AI swarm for your machine.
 * Usage: laruche <command> [options]
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execa } from "execa";
import readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VERSION = "3.0.0";

// ─── Banner ───────────────────────────────────────────────────────────────────
const BANNER = boxen(
  chalk.hex("#F5A623").bold("🐝  L A R U C H E") + "\n" +
  chalk.hex("#7C3AED")("Ghost Swarm Autonomous Agent") + "\n" +
  chalk.dim(`v${VERSION} — SINGULARITY Edition`),
  {
    padding: { top: 1, bottom: 1, left: 3, right: 3 },
    margin: 0,
    borderStyle: "round",
    borderColor: "yellow",
  }
);

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH = join(ROOT, ".laruche/config.json");
const REGISTRY_PATH = join(ROOT, ".laruche/registry.json");

function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); }
  catch { return {}; }
}

function loadRegistry() {
  try { return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")); }
  catch { return { skills: [] }; }
}

// ─── Ollama Health ────────────────────────────────────────────────────────────
async function checkOllama() {
  try {
    const res = await fetch(
      `${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/tags`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return { ok: false, models: [] };
    const data = await res.json();
    return { ok: true, models: data.models?.map((m) => m.name) || [] };
  } catch {
    return { ok: false, models: [] };
  }
}

// ─── Program ─────────────────────────────────────────────────────────────────
const program = new Command();

program
  .name("laruche")
  .description("🐝 LaRuche — Sovereign AI Swarm CLI")
  .version(VERSION)
  .addHelpText("before", "\n" + BANNER + "\n");

// ─── laruche start ────────────────────────────────────────────────────────────
program
  .command("start")
  .description("Démarrer l'essaim LaRuche (queen + watcher + dashboard)")
  .option("--no-hud", "Désactiver le HUD Electron")
  .option("--dev", "Mode développement (logs détaillés)")
  .action(async (opts) => {
    console.log("\n" + BANNER + "\n");

    const spinner = ora(chalk.dim("Vérification système...")).start();

    // Checks
    const ollama = await checkOllama();
    const envExists = existsSync(join(ROOT, ".env"));

    spinner.stop();

    console.log(`  Ollama:    ${ollama.ok ? chalk.green("✓ Online") : chalk.red("✗ Offline")}`);
    console.log(`  Config:    ${envExists ? chalk.green("✓ .env présent") : chalk.yellow("⚠ .env manquant")}`);
    console.log(`  Modèles:   ${ollama.models.slice(0, 3).join(", ") || "aucun"}`);
    console.log();

    if (!envExists) {
      console.log(chalk.yellow("⚠ Configurez d'abord: laruche init\n"));
      process.exit(1);
    }

    const startSpinner = ora(chalk.dim("Démarrage de l'essaim...")).start();

    try {
      const ecosystem = join(ROOT, "ecosystem.config.js");
      const apps = ["laruche-queen", "laruche-watcher", "laruche-dashboard"];
      if (opts.hud !== false) apps.push("laruche-hud");

      await execa("npx", ["pm2", "start", ecosystem, "--env", opts.dev ? "development" : "production"], {
        cwd: ROOT,
        reject: false,
      });

      startSpinner.succeed(chalk.green("LaRuche démarrée !"));

      console.log();
      console.log(boxen(
        chalk.white.bold("🐝 LaRuche opérationnelle\n\n") +
        chalk.dim("Dashboard: ") + chalk.cyan("http://localhost:8080") + "\n" +
        chalk.dim("HUD:       ") + chalk.cyan("Ctrl+Shift+H") + "\n" +
        chalk.dim("Telegram:  ") + chalk.cyan("Envoyez /status") + "\n\n" +
        chalk.dim("Arrêter:   ") + chalk.yellow("laruche stop"),
        { padding: 1, borderStyle: "round", borderColor: "yellow" }
      ));
    } catch (e) {
      startSpinner.fail(chalk.red(`Erreur: ${e.message}`));
      process.exit(1);
    }
  });

// ─── laruche stop ─────────────────────────────────────────────────────────────
program
  .command("stop")
  .description("Arrêter tous les processus LaRuche")
  .action(async () => {
    const spinner = ora("Arrêt de l'essaim...").start();
    await execa("npx", ["pm2", "stop", "all"], { cwd: ROOT, reject: false });
    spinner.succeed(chalk.yellow("LaRuche arrêtée."));
  });

// ─── laruche status ───────────────────────────────────────────────────────────
program
  .command("status")
  .description("État du système et des agents")
  .action(async () => {
    console.log(chalk.hex("#F5A623").bold("\n🐝 LaRuche Status\n"));

    const [ollama, pm2Result] = await Promise.all([
      checkOllama(),
      execa("npx", ["pm2", "jlist"], { cwd: ROOT, reject: false }),
    ]);

    // Ollama
    console.log(chalk.bold("  Ollama:"));
    console.log(`    Status:  ${ollama.ok ? chalk.green("Online") : chalk.red("Offline")}`);
    if (ollama.models.length) {
      console.log(`    Modèles: ${ollama.models.join(", ")}`);
    }

    // PM2 processes
    console.log(chalk.bold("\n  Processus LaRuche:"));
    try {
      const apps = JSON.parse(pm2Result.stdout || "[]").filter((a) =>
        a.name.startsWith("laruche")
      );
      if (apps.length === 0) {
        console.log(chalk.dim("    Aucun processus actif — lancez: laruche start"));
      } else {
        apps.forEach((a) => {
          const status = a.pm2_env?.status;
          const color = status === "online" ? chalk.green : chalk.red;
          const mem = Math.round((a.monit?.memory || 0) / (1024 * 1024));
          const cpu = a.monit?.cpu || 0;
          console.log(`    ${color("●")} ${a.name.padEnd(25)} ${color(status)} ${chalk.dim(`${mem}MB ${cpu}%CPU`)}`);
        });
      }
    } catch {
      console.log(chalk.dim("    PM2 non disponible"));
    }

    // Registry skills
    const registry = loadRegistry();
    console.log(chalk.bold(`\n  Skills: ${registry.skills?.length || 0} enregistrés`));

    console.log();
  });

// ─── laruche init ─────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Configurer LaRuche (API keys, Telegram, etc.)")
  .action(async () => {
    console.log(chalk.hex("#F5A623").bold("\n🐝 LaRuche Init — Configuration\n"));

    const envPath = join(ROOT, ".env");
    const envExample = join(ROOT, ".env.example");

    if (!existsSync(envPath) && existsSync(envExample)) {
      const { execSync } = await import("child_process");
      execSync(`cp "${envExample}" "${envPath}"`);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((res) => rl.question(chalk.cyan(q), res));

    console.log(chalk.dim("Appuyez sur Entrée pour garder la valeur actuelle.\n"));

    const token = await ask("TELEGRAM_BOT_TOKEN (depuis @BotFather): ");
    const chatId = await ask("ADMIN_TELEGRAM_ID (votre ID Telegram): ");
    const ollamaHost = await ask("OLLAMA_HOST [http://localhost:11434]: ");

    rl.close();

    // Lecture .env actuel
    let env = "";
    try { env = readFileSync(envPath, "utf-8"); } catch {}

    const setEnv = (key, val) => {
      if (!val) return;
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(env)) {
        env = env.replace(regex, `${key}=${val}`);
      } else {
        env += `\n${key}=${val}`;
      }
    };

    setEnv("TELEGRAM_BOT_TOKEN", token);
    setEnv("ADMIN_TELEGRAM_ID", chatId);
    if (ollamaHost) setEnv("OLLAMA_HOST", ollamaHost);

    writeFileSync(envPath, env);

    console.log(chalk.green("\n✅ Configuration sauvegardée dans .env"));
    console.log(chalk.dim("Lancez maintenant: ") + chalk.cyan("laruche start\n"));
  });

// ─── laruche doctor ───────────────────────────────────────────────────────────
program
  .command("doctor")
  .description("Diagnostic complet du système")
  .action(async () => {
    console.log(chalk.hex("#F5A623").bold("\n🩺 LaRuche Doctor\n"));

    const checks = [];

    // Node.js
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1));
    checks.push({
      name: "Node.js",
      ok: nodeMajor >= 20,
      detail: nodeVersion,
      fix: nodeMajor < 20 ? "Installez Node.js 20+" : null,
    });

    // Python
    try {
      const { stdout } = await execa("python3", ["--version"], { reject: false });
      checks.push({ name: "Python 3", ok: true, detail: stdout.trim() });
    } catch {
      checks.push({ name: "Python 3", ok: false, detail: "Non trouvé", fix: "Installez Python 3.11+" });
    }

    // Ollama
    const ollama = await checkOllama();
    checks.push({
      name: "Ollama",
      ok: ollama.ok,
      detail: ollama.ok ? `${ollama.models.length} modèle(s)` : "Non disponible",
      fix: ollama.ok ? null : "Lancez: ollama serve",
    });

    // .env
    const envOk = existsSync(join(ROOT, ".env"));
    checks.push({
      name: ".env",
      ok: envOk,
      detail: envOk ? "Présent" : "Manquant",
      fix: !envOk ? "Lancez: laruche init" : null,
    });

    // PM2
    try {
      await execa("npx", ["pm2", "--version"], { reject: false });
      checks.push({ name: "PM2", ok: true, detail: "Disponible" });
    } catch {
      checks.push({ name: "PM2", ok: false, detail: "Non trouvé", fix: "npm install -g pm2" });
    }

    // rsync
    try {
      await execa("rsync", ["--version"], { reject: false });
      checks.push({ name: "rsync", ok: true, detail: "Disponible" });
    } catch {
      checks.push({ name: "rsync", ok: false, detail: "Non trouvé" });
    }

    // Affichage
    checks.forEach((c) => {
      const icon = c.ok ? chalk.green("✓") : chalk.red("✗");
      const name = c.name.padEnd(15);
      const detail = chalk.dim(c.detail);
      const fix = c.fix ? chalk.yellow(` → ${c.fix}`) : "";
      console.log(`  ${icon} ${name} ${detail}${fix}`);
    });

    const allOk = checks.every((c) => c.ok);
    console.log();
    if (allOk) {
      console.log(chalk.green("  ✅ Tout est prêt. Lancez: laruche start\n"));
    } else {
      console.log(chalk.yellow("  ⚠ Corrigez les erreurs ci-dessus puis relancez: laruche doctor\n"));
    }
  });

// ─── laruche skill ────────────────────────────────────────────────────────────
const skillCmd = program.command("skill").description("Gérer les skills de l'essaim");

skillCmd
  .command("list")
  .description("Lister les skills disponibles")
  .action(() => {
    const registry = loadRegistry();
    const skills = registry.skills || [];
    console.log(chalk.hex("#F5A623").bold(`\n🔧 Skills LaRuche (${skills.length})\n`));
    if (skills.length === 0) {
      console.log(chalk.dim("  Aucun skill enregistré.\n  Créez-en un: laruche skill create <description>\n"));
      return;
    }
    skills.forEach((s) => {
      const ttl = s.ttl ? chalk.yellow(` TTL:${s.ttl}`) : "";
      console.log(`  ${chalk.cyan("●")} ${s.name.padEnd(30)} ${chalk.dim(`v${s.version}`)}${ttl}`);
      if (s.description) console.log(chalk.dim(`      ${s.description}`));
    });
    console.log();
  });

skillCmd
  .command("create <description>")
  .description("Créer un nouveau skill via IA")
  .action(async (description) => {
    const spinner = ora(`Création du skill: "${description}"...`).start();
    try {
      const res = await fetch("http://localhost:8080/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `/skill create ${description}` }),
      });
      spinner.succeed(chalk.green(`Skill créé: ${description}`));
    } catch {
      spinner.warn(chalk.yellow("LaRuche non démarrée. Lancez d'abord: laruche start"));
    }
  });

// ─── laruche hive ─────────────────────────────────────────────────────────────
program
  .command("hive")
  .description("🌐 Marketplace communauté — skills partagés par la ruche mondiale")
  .action(async () => {
    console.log(chalk.hex("#F5A623").bold("\n🌐 LaRuche HIVE — Communauté Mondiale\n"));

    const spinner = ora("Connexion à la ruche...").start();

    try {
      // GitHub registry (skills communauté)
      const res = await fetch(
        "https://raw.githubusercontent.com/AMFbot-Gz/LaRuche/main/.laruche/registry.json",
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) throw new Error("Registry inaccessible");
      const community = await res.json();

      spinner.succeed(chalk.green(`${community.skills?.length || 0} skills communauté disponibles`));
      console.log();

      (community.skills || []).forEach((s) => {
        console.log(`  ${chalk.yellow("🐝")} ${chalk.bold(s.name).padEnd(30)} ${chalk.dim(s.description || "")}`);
      });
    } catch (e) {
      spinner.warn(chalk.dim("Registry communauté non disponible (mode offline)"));
      console.log(chalk.dim("\n  Partagez vos skills sur github.com/AMFbot-Gz/LaRuche\n"));
    }

    console.log();
    console.log(chalk.dim("  Pour contribuer: ") + chalk.cyan("laruche hive push <skill-name>"));
    console.log();
  });

// ─── laruche logs ─────────────────────────────────────────────────────────────
program
  .command("logs")
  .description("Afficher les logs en temps réel")
  .option("-n, --lines <n>", "Nombre de lignes", "50")
  .action(async (opts) => {
    await execa("npx", ["pm2", "logs", "--lines", opts.lines], {
      cwd: ROOT,
      stdio: "inherit",
      reject: false,
    });
  });

// ─── laruche rollback ─────────────────────────────────────────────────────────
program
  .command("rollback [snapshot]")
  .description("Restaurer un snapshot système")
  .action(async (snapshot) => {
    if (!snapshot) {
      // Lister les snapshots disponibles
      const { readdirSync, readFileSync, statSync } = await import("fs");
      const ROLLBACK_DIR = join(ROOT, ".laruche/rollback");
      try {
        const dirs = readdirSync(ROLLBACK_DIR)
          .filter((d) => { try { return statSync(join(ROLLBACK_DIR, d)).isDirectory(); } catch { return false; } });

        if (dirs.length === 0) {
          console.log(chalk.dim("Aucun snapshot disponible."));
          return;
        }

        console.log(chalk.hex("#F5A623").bold("\n⏪ Snapshots disponibles:\n"));
        dirs.slice(0, 10).forEach((d, i) => {
          console.log(`  ${chalk.dim(String(i + 1).padStart(2))}. ${d}`);
        });
        console.log(chalk.dim(`\nUsage: laruche rollback <snapshot-id>\n`));
      } catch {
        console.log(chalk.dim("Dossier rollback introuvable."));
      }
      return;
    }

    const spinner = ora(`Restauration: ${snapshot}...`).start();
    try {
      const { execa } = await import("execa");
      const ROLLBACK_DIR = join(ROOT, ".laruche/rollback");
      await execa("rsync", ["-av", "--checksum",
        `${ROLLBACK_DIR}/${snapshot}/src/`, `${ROOT}/src/`],
        { reject: false }
      );
      spinner.succeed(chalk.green(`Rollback vers ${snapshot} effectué.`));
    } catch (e) {
      spinner.fail(chalk.red(`Erreur: ${e.message}`));
    }
  });

// ─── laruche send ─────────────────────────────────────────────────────────────
program
  .command("send <message...>")
  .description("Envoyer une commande à l'essaim")
  .action(async (messageParts) => {
    const message = messageParts.join(" ");
    const spinner = ora(`Envoi: "${message}"...`).start();
    try {
      const res = await fetch("http://localhost:8080/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: message }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (data.success) {
        spinner.succeed(chalk.green("Commande envoyée à l'essaim."));
      } else {
        spinner.fail(chalk.red(data.error || "Erreur inconnue"));
      }
    } catch {
      spinner.fail(chalk.red("LaRuche non disponible. Lancez: laruche start"));
    }
  });

// ─── laruche models ───────────────────────────────────────────────────────────
program
  .command("models")
  .description("Voir et configurer les modèles Ollama (auto-détection)")
  .option("--set-role <role=model>", "Forcer un modèle pour un rôle (ex: architect=qwen3-coder:14b)")
  .action(async (opts) => {
    const { autoDetectRoles, getAvailableModels } = await import("../src/model_router.js");

    console.log(chalk.hex("#F5A623").bold("\n🐝 Configuration Modèles LaRuche\n"));

    const spinner = ora("Interrogation Ollama...").start();
    const [roles, available] = await Promise.all([autoDetectRoles(), getAvailableModels()]);
    spinner.stop();

    const icons = {
      strategist:  "👑 L1 Stratège   ",
      architect:   "🔧 L2 Architecte ",
      worker:      "⚡ L3 Ouvrière   ",
      vision:      "👁 L4 Vision     ",
      visionFast:  "📷 L4 Vision fast",
      synthesizer: "🧠 Synthèse      ",
    };

    for (const [role, model] of Object.entries(roles)) {
      console.log(`  ${chalk.dim(icons[role] || role)} → ${chalk.cyan(model)}`);
    }

    console.log(chalk.bold(`\n  Modèles Ollama disponibles (${available.length}):`));
    available.forEach((m) => {
      const used = Object.values(roles).includes(m);
      console.log(`  ${used ? chalk.green("✓") : chalk.dim("○")} ${m}`);
    });

    if (opts.setRole) {
      const [role, model] = opts.setRole.split("=");
      if (role && model) {
        const { readFileSync, writeFileSync } = await import("fs");
        const configPath = join(ROOT, ".laruche/config.json");
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (!config.models) config.models = {};
        config.models[role] = model;
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(chalk.green(`\n✅ Rôle "${role}" → "${model}" configuré`));
      }
    }

    console.log(chalk.dim(`\n  Pour forcer un modèle: laruche models --set-role architect=qwen3-coder:14b\n`));
  });

program.parse();
