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

async function getDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    _db = new SQL.Database(readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }
  return _db;
}

function save() {
  if (!_db) return;
  writeFileSync(DB_PATH, Buffer.from(_db.export()));
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
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export async function all(sql, params = []) {
  const db = await getDb();
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}
