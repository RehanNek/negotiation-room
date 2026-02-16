import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../db';
import { evaluateCondition } from './ai';
import { fetchExternalData } from './external';
import { createAttestation } from './attestation';
import type { ConditionVerdict } from '../types';

interface CreateContractParams {
  negotiation_id: string;
  deal_type: string;
  terms: Record<string, any>;
  summary: string;
  party_a_wallet: string;
  party_b_wallet: string;
  condition_desc?: string;
  condition_data_source?: string;
  resolution_date?: string;
}

export function createContract(params: CreateContractParams): any {
  const id = uuidv4();
  const status = params.deal_type === 'conditional' ? 'pending_resolution' : 'active';

  run(
    `INSERT INTO contracts (id, negotiation_id, deal_type, terms, summary, party_a_wallet, party_b_wallet, status, condition_desc, condition_data_source, resolution_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.negotiation_id, params.deal_type, JSON.stringify(params.terms), params.summary,
     params.party_a_wallet, params.party_b_wallet, status,
     params.condition_desc || null, params.condition_data_source || null, params.resolution_date || null]
  );

  if (params.deal_type === 'conditional' && params.condition_desc) {
    const condId = uuidv4();
    run(
      `INSERT INTO conditions (id, contract_id, description, data_source, threshold, resolution_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [condId, id, params.condition_desc,
       params.condition_data_source || 'manual',
       params.terms.threshold || '',
       params.resolution_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()]
    );
  }

  return getContract(id);
}

export function getContract(contractId: string): any {
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) return null;

  const conditions = all('SELECT * FROM conditions WHERE contract_id = ?', [contractId]);

  return {
    ...contract,
    terms: JSON.parse(contract.terms as string),
    conditions,
  };
}

export function getContractsByWallet(wallet: string): any[] {
  const contracts = all(
    'SELECT * FROM contracts WHERE party_a_wallet = ? OR party_b_wallet = ? ORDER BY created_at DESC',
    [wallet, wallet]
  );

  return contracts.map((c: any) => ({
    ...c,
    terms: JSON.parse(c.terms as string),
  }));
}

export async function resolveCondition(contractId: string): Promise<any> {
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) throw new Error('Contract not found');
  if (contract.deal_type !== 'conditional') throw new Error('Not a conditional contract');
  if (contract.status === 'resolved') throw new Error('Contract already resolved');

  const condition = get('SELECT * FROM conditions WHERE contract_id = ?', [contractId]);
  if (!condition) throw new Error('No condition found for this contract');

  const terms = JSON.parse(contract.terms as string);
  const externalData = await fetchExternalData(condition.data_source as string, {
    coin_id: contract.condition_data_source === 'coingecko' ? (terms.coin_id || 'bitcoin') : undefined,
    query: condition.description as string,
  });

  const evaluation = await evaluateCondition(condition.description as string, externalData);
  const verdict = evaluation.verdict as ConditionVerdict;

  run(
    `UPDATE conditions SET verdict = ?, evidence = ?, reasoning = ?, checked_at = datetime('now') WHERE id = ?`,
    [verdict, JSON.stringify(externalData), evaluation.reasoning, condition.id as string]
  );

  const attestation = createAttestation(contractId, 'condition_resolution', {
    contract_id: contractId,
    condition: condition.description,
    external_data: externalData,
    verdict,
    confidence: evaluation.confidence,
    reasoning: evaluation.reasoning,
    resolved_at: new Date().toISOString(),
  });

  run(
    `UPDATE contracts SET status = 'resolved', verdict = ?, verdict_reasoning = ?, attestation_id = ?, resolved_at = datetime('now') WHERE id = ?`,
    [verdict, evaluation.reasoning, attestation.id, contractId]
  );

  return {
    contract_id: contractId,
    verdict,
    confidence: evaluation.confidence,
    reasoning: evaluation.reasoning,
    external_data: externalData,
    attestation,
  };
}
