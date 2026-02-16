import fs from 'fs';
import os from 'os';
import path from 'path';
import initSqlJs from 'sql.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

let tmpDir = '';

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  }
  delete process.env.DATABASE_PATH;
  delete process.env.DB_FLUSH_INTERVAL_MS;
});

async function countNegotiationsOnDisk(dbPath: string): Promise<number> {
  if (!fs.existsSync(dbPath)) return 0;
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  const stmt = db.prepare('SELECT COUNT(*) AS count FROM negotiations');
  if (!stmt.step()) {
    stmt.free();
    db.close();
    return 0;
  }
  const row = stmt.getAsObject() as { count: number };
  stmt.free();
  db.close();
  return row.count;
}

describe('Buffered DB persistence', () => {
  it('defers disk writes until an explicit flush', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'the-room-db-buffering-'));
    const dbPath = path.join(tmpDir, 'room.db');
    process.env.DATABASE_PATH = dbPath;
    process.env.DB_FLUSH_INTERVAL_MS = '600000';
    vi.resetModules();

    const dbModule = await import('../src/db');
    await dbModule.getDb();
    const beforeInsert = await countNegotiationsOnDisk(dbPath);

    dbModule.run(
      'INSERT INTO negotiations (id, deal_type, category, params, party_a_wallet, party_a_constraints) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'test-negotiation-id',
        'service',
        'test-category',
        JSON.stringify({}),
        '0x1111111111111111111111111111111111111111',
        JSON.stringify({}),
      ]
    );

    const beforeFlush = await countNegotiationsOnDisk(dbPath);
    expect(beforeFlush).toBe(beforeInsert);

    dbModule.flushDb();
    const afterFlush = await countNegotiationsOnDisk(dbPath);
    expect(afterFlush).toBe(beforeInsert + 1);

    dbModule.stopDbPersistence();
  });
});
