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
      return { label: 'Live', tone: 'success', description: 'Send messages, press Done when terms are agreed, or walk away.' };
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
      return { label: 'Needs Resolution', tone: 'warning', description: 'Resolve condition and generate attested verdict.' };
    case 'active':
      return { label: 'Active', tone: 'info', description: 'Contract is active with no pending verdict.' };
    case 'resolved':
      return { label: 'Resolved', tone: 'success', description: 'Final verdict and attestation are available.' };
    default:
      return { label: 'Unknown', tone: 'neutral', description: 'Status unavailable.' };
  }
}

export function verdictStatusCopy(verdict: ConditionVerdict | null | undefined): StatusCopy {
  if (verdict === 'TRUE') {
    return { label: 'Condition TRUE', tone: 'success', description: 'Condition evaluated as true from attested inputs.' };
  }
  if (verdict === 'FALSE') {
    return { label: 'Condition FALSE', tone: 'danger', description: 'Condition evaluated as false from attested inputs.' };
  }
  return { label: 'Pending Verdict', tone: 'warning', description: 'Condition has not been finalized yet.' };
}
