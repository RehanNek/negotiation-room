import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './schema';

let db: Database;
let dirty = false;
let flushInterval: NodeJS.Timeout | null = null;
let persistenceEnabled = true;

const dbPath = process.env.DATABASE_PATH || './data/room.db';
const flushIntervalMs = Number.parseInt(process.env.DB_FLUSH_INTERVAL_MS || '2000', 10);

function disablePersistence(reason: unknown): void {
  if (!persistenceEnabled) return;
  persistenceEnabled = false;
  dirty = false;
  const message = reason instanceof Error ? reason.message : String(reason);
  console.warn(`DB persistence disabled; running in-memory only (${dbPath}). Reason: ${message}`);
}

function ensureFlushInterval(): void {
  if (!persistenceEnabled) return;
  if (flushInterval) return;

  flushInterval = setInterval(() => {
    try {
      saveDb();
    } catch (err) {
      console.error('Periodic DB flush failed:', err);
    }
  }, Number.isFinite(flushIntervalMs) && flushIntervalMs > 0 ? flushIntervalMs : 2000);

  if (typeof flushInterval.unref === 'function') {
    flushInterval.unref();
  }
}

export function stopDbPersistence(): void {
  if (!flushInterval) return;
  clearInterval(flushInterval);
  flushInterval = null;
}

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  db = new SQL.Database();

  if (persistenceEnabled) {
    try {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
      }
    } catch (err) {
      disablePersistence(err);
      db = new SQL.Database();
    }
  }

  db.run('PRAGMA foreign_keys = ON');
  initializeDatabase(db);
  if (persistenceEnabled) {
    dirty = true;
    saveDb(true);
  }
  ensureFlushInterval();

  return db;
}

export function saveDb(force: boolean = false): void {
  if (!persistenceEnabled) return;
  if (!db) return;
  if (!force && !dirty) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbDir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(dbPath, buffer);
    dirty = false;
  } catch (err) {
    disablePersistence(err);
  }
}

export function flushDb(): void {
  saveDb(true);
}

// Helper to run queries and mark DB dirty
export function run(sql: string, params?: any[]): void {
  db.run(sql, params);
  if (persistenceEnabled) {
    dirty = true;
  }
}

export function get(sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function all(sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}
