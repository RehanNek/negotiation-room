import type { Database } from 'sql.js';

export function initializeDatabase(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      deal_type TEXT NOT NULL CHECK(deal_type IN ('service', 'conditional')),
      category TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'deal', 'impasse', 'no_deal')),
      max_rounds INTEGER NOT NULL DEFAULT 5,
      current_round INTEGER NOT NULL DEFAULT 0,
      party_a_wallet TEXT NOT NULL,
      party_b_wallet TEXT,
      party_a_constraints TEXT NOT NULL DEFAULT '{}',
      party_b_constraints TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      negotiation_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      party TEXT NOT NULL CHECK(party IN ('A', 'B')),
      offer_raw TEXT NOT NULL,
      offer_structured TEXT NOT NULL DEFAULT '{}',
      ai_suggestion TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (negotiation_id) REFERENCES negotiations(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      negotiation_id TEXT NOT NULL,
      deal_type TEXT NOT NULL CHECK(deal_type IN ('service', 'conditional')),
      terms TEXT NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL,
      party_a_wallet TEXT NOT NULL,
      party_b_wallet TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending_resolution', 'resolved')),
      condition_desc TEXT,
      condition_data_source TEXT,
      resolution_date TEXT,
      verdict TEXT CHECK(verdict IN ('TRUE', 'FALSE', 'PENDING') OR verdict IS NULL),
      verdict_reasoning TEXT,
      attestation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (negotiation_id) REFERENCES negotiations(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conditions (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      description TEXT NOT NULL,
      data_source TEXT NOT NULL,
      threshold TEXT NOT NULL,
      resolution_date TEXT NOT NULL,
      verdict TEXT NOT NULL DEFAULT 'PENDING' CHECK(verdict IN ('TRUE', 'FALSE', 'PENDING')),
      evidence TEXT,
      reasoning TEXT,
      checked_at TEXT,
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reputation (
      wallet_address TEXT PRIMARY KEY,
      total_negotiations INTEGER NOT NULL DEFAULT 0,
      deals_completed INTEGER NOT NULL DEFAULT 0,
      conditional_deals INTEGER NOT NULL DEFAULT 0,
      avg_rounds REAL NOT NULL DEFAULT 0,
      good_faith_score REAL NOT NULL DEFAULT 50,
      total_reputation INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attestations (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data_hash TEXT NOT NULL,
      tee_signature TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )
  `);
}
