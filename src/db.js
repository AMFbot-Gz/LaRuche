/**
 * db.js — Wrapper SQL.js (pure JS, compatible Node 25+)
 * Drop-in replacement pour better-sqlite3
 */
import initSqlJs from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB_PATH = join(ROOT, ".laruche/shadow-errors.db");

mkdirSync(join(ROOT, ".laruche"), { recursive: true });

let _db = null;
let _initPromise = null;

async function getDb() {
  if (_db) return _db;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const SQL = await initSqlJs();
    if (existsSync(DB_PATH)) {
      _db = new SQL.Database(readFileSync(DB_PATH));
    } else {
      _db = new SQL.Database();
    }
    return _db;
  })();
  return _initPromise;
}

const _stmtCache = new Map();
function getStmt(sql) {
  if (!_stmtCache.has(sql)) {
    _stmtCache.set(sql, _db.prepare(sql));
  }
  return _stmtCache.get(sql);
}

let _saveTimer = null;
function save() {
  if (!_db) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (_db) {
      writeFileSync(DB_PATH, Buffer.from(_db.export()));
    }
  }, 500);
}

// Flush immédiat (avant shutdown)
export function flushDb() {
  clearTimeout(_saveTimer);
  if (_db) writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

export async function initDb(schema) {
  const db = await getDb();
  db.run(schema);
  save();
  return db;
}

export async function run(sql, params = []) {
  const db = await getDb();
  db.run(sql, params);
  save();
}

export async function get(sql, params = []) {
  await getDb();
  const stmt = getStmt(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.reset();
    return row;
  }
  stmt.reset();
  return null;
}

export async function all(sql, params = []) {
  await getDb();
  const results = [];
  const stmt = getStmt(sql);
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.reset();
  return results;
}
