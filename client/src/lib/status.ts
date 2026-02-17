import type { ContractStatus, ConditionVerdict, NegotiationStatus } from './types';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusCopy {
  label: string;
  tone: Tone;
  description: string;
}

export function negotiationStatusCopy(status: NegotiationStatus): StatusCopy {
  switch (status) {
    case 'waiting':
      return { label: 'Waiting', tone: 'warning', description: 'Share the room code so the other party can join.' };
    case 'active':
      return { label: 'Live', tone: 'success', description: 'Send messages, then use Confirm Terms & Done once terms are aligned.' };
    case 'deal':
      return { label: 'Deal Reached', tone: 'success', description: 'Done confirmed. Contract generation complete.' };
    case 'impasse':
      return { label: 'Impasse', tone: 'danger', description: 'Negotiation closed without agreement.' };
    case 'no_deal':
      return { label: 'No Deal', tone: 'danger', description: 'A participant exited the negotiation.' };
    default:
      return { label: 'Unknown', tone: 'neutral', description: 'Status unavailable.' };
  }
}

export function contractStatusCopy(status: ContractStatus): StatusCopy {
  switch (status) {
    case 'pending_resolution':
      return { label: 'Action Needed', tone: 'warning', description: 'Run the rule check to decide the outcome.' };
    case 'active':
      return { label: 'In Progress', tone: 'info', description: 'Contract is live and waiting for completion confirmation.' };
    case 'resolved':
      return { label: 'Completed', tone: 'success', description: 'Final outcome is recorded with proof.' };
    default:
      return { label: 'Unknown', tone: 'neutral', description: 'Status unavailable.' };
  }
}

export function verdictStatusCopy(verdict: ConditionVerdict | null | undefined): StatusCopy {
  if (verdict === 'TRUE') {
    return { label: 'Rule Passed', tone: 'success', description: 'The contract rule evaluated to true.' };
  }
  if (verdict === 'FALSE') {
    return { label: 'Rule Failed', tone: 'danger', description: 'The contract rule evaluated to false.' };
  }
  return { label: 'Pending', tone: 'warning', description: 'Outcome has not been finalized yet.' };
}

export function inferAttestationVerdict(attestation?: {
  type?: string | null;
  payload?: Record<string, unknown> | null;
}): ConditionVerdict | undefined {
  const payloadVerdict = attestation?.payload?.verdict;
  if (payloadVerdict === 'TRUE' || payloadVerdict === 'FALSE') {
    return payloadVerdict;
  }

  const payloadAction = attestation?.payload?.action;
  if (attestation?.type === 'service_affirmation' || payloadAction === 'service_delivery_affirmed') {
    return 'TRUE';
  }

  return undefined;
}
