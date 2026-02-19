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
      final_terms_draft TEXT,
      final_terms_hash TEXT,
      party_a_confirmed_terms_hash TEXT,
      party_b_confirmed_terms_hash TEXT,
      party_a_done_at TEXT,
      party_b_done_at TEXT,
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
      terms_hash TEXT,
      confirmed_by_a_at TEXT,
      confirmed_by_b_at TEXT,
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
      signature TEXT,
      sig_type TEXT NOT NULL DEFAULT 'eip712',
      signer_wallet TEXT,
      sig_domain TEXT,
      sig_types TEXT,
      sig_message TEXT,
      hash_algo TEXT NOT NULL DEFAULT 'sha256-rfc8785',
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL UNIQUE,
      deal_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting_funding' CHECK(status IN ('awaiting_funding', 'funded', 'released', 'refunded', 'failed')),
      chain_id INTEGER NOT NULL,
      asset TEXT NOT NULL DEFAULT 'ETH',
      amount_wei TEXT NOT NULL,
      payer_wallet TEXT NOT NULL,
      recipient_if_true_wallet TEXT NOT NULL,
      recipient_if_false_wallet TEXT NOT NULL,
      timeout_at TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      fund_tx_hash TEXT,
      fund_block_number INTEGER,
      settle_tx_hash TEXT,
      refund_tx_hash TEXT,
      attestation_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_contracts_party_a_wallet ON contracts(party_a_wallet)');
  db.run('CREATE INDEX IF NOT EXISTS idx_contracts_party_b_wallet ON contracts(party_b_wallet)');
  db.run('CREATE INDEX IF NOT EXISTS idx_escrows_contract_id ON escrows(contract_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_attestations_contract_id ON attestations(contract_id)');

  // Additive migrations for already-initialized databases.
  addColumnIfMissing(db, 'negotiations', 'final_terms_draft', 'TEXT');
  addColumnIfMissing(db, 'negotiations', 'final_terms_hash', 'TEXT');
  addColumnIfMissing(db, 'negotiations', 'party_a_confirmed_terms_hash', 'TEXT');
  addColumnIfMissing(db, 'negotiations', 'party_b_confirmed_terms_hash', 'TEXT');
  addColumnIfMissing(db, 'negotiations', 'party_a_done_at', 'TEXT');
  addColumnIfMissing(db, 'negotiations', 'party_b_done_at', 'TEXT');
  addColumnIfMissing(db, 'contracts', 'terms_hash', 'TEXT');
  addColumnIfMissing(db, 'contracts', 'confirmed_by_a_at', 'TEXT');
  addColumnIfMissing(db, 'contracts', 'confirmed_by_b_at', 'TEXT');
  addColumnIfMissing(db, 'attestations', 'signature', 'TEXT');
  addColumnIfMissing(db, 'attestations', 'sig_type', "TEXT NOT NULL DEFAULT 'eip712'");
  addColumnIfMissing(db, 'attestations', 'signer_wallet', 'TEXT');
  addColumnIfMissing(db, 'attestations', 'sig_domain', 'TEXT');
  addColumnIfMissing(db, 'attestations', 'sig_types', 'TEXT');
  addColumnIfMissing(db, 'attestations', 'sig_message', 'TEXT');
  addColumnIfMissing(db, 'attestations', 'hash_algo', "TEXT NOT NULL DEFAULT 'sha256-rfc8785'");
}

function addColumnIfMissing(db: Database, tableName: string, columnName: string, sqlType: string): void {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  let existing = false;
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    if (String(row.name || '') === columnName) {
      existing = true;
      break;
    }
  }
  stmt.free();
  if (existing) return;
  db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
}
