import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './schema';

let db: Database;

const dbPath = process.env.DATABASE_PATH || './data/room.db';

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Load existing DB or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  initializeDatabase(db);
  saveDb();

  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  fs.writeFileSync(dbPath, buffer);
}

// Helper to run queries and auto-save
export function run(sql: string, params?: any[]): void {
  db.run(sql, params);
  saveDb();
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
