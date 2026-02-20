type UnknownRecord = Record<string, unknown>;

function normalizeWallet(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function pickWallet(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeWallet(value);
    if (normalized) return normalized;
  }
  return null;
}

export function parseContractTerms(rawTerms: unknown): UnknownRecord {
  if (typeof rawTerms !== 'string') return {};
  try {
    const parsed = JSON.parse(rawTerms);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as UnknownRecord;
  } catch {
    return {};
  }
  return {};
}

export function parseAgreedTerms(terms: UnknownRecord): UnknownRecord {
  const agreed = terms.agreed_terms;
  if (agreed && typeof agreed === 'object' && !Array.isArray(agreed)) {
    return agreed as UnknownRecord;
  }
  return {};
}

export function resolveServiceRoles(params: {
  partyAWallet: string;
  partyBWallet: string;
  terms: UnknownRecord;
  agreedTerms: UnknownRecord;
}): { receiverWallet: string; providerWallet: string } {
  const { partyAWallet, partyBWallet, terms, agreedTerms } = params;
  const partyA = partyAWallet.toLowerCase();
  const partyB = partyBWallet.toLowerCase();

  const explicitReceiver = pickWallet(
    agreedTerms.receiver_wallet,
    agreedTerms.client_wallet,
    agreedTerms.buyer_wallet,
    agreedTerms.requester_wallet,
    terms.receiver_wallet,
    terms.client_wallet,
    terms.buyer_wallet,
    terms.requester_wallet
  );

  const explicitProvider = pickWallet(
    agreedTerms.provider_wallet,
    agreedTerms.seller_wallet,
    agreedTerms.vendor_wallet,
    terms.provider_wallet,
    terms.seller_wallet,
    terms.vendor_wallet
  );

  let receiver = explicitReceiver || null;
  let provider = explicitProvider || null;

  if (!receiver && provider) {
    receiver = provider === partyA ? partyB : partyA;
  }

  if (!provider && receiver) {
    provider = receiver === partyA ? partyB : partyA;
  }

  if (!receiver) receiver = partyA;
  if (!provider) provider = receiver === partyA ? partyB : partyA;

  if (provider === receiver) {
    provider = receiver === partyA ? partyB : partyA;
  }

  return {
    receiverWallet: receiver,
    providerWallet: provider,
  };
}
