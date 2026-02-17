import OpenAI from 'openai';

function env(key: string, fallback: string = ''): string {
  return process.env[key] || fallback;
}

const fallbackModel = 'qwen3-32b-128k-bf16';

async function chatCompletion(messages: OpenAI.Chat.ChatCompletionMessageParam[], useModel?: string): Promise<string> {
  const GRANT_MESSAGE = env('GRANT_MESSAGE');
  const GRANT_SIGNATURE = env('GRANT_SIGNATURE');
  const GRANT_WALLET = env('GRANT_WALLET');
  const useGrant = !!(GRANT_MESSAGE && GRANT_SIGNATURE && GRANT_WALLET);
  const currentModel = useModel || env('EIGENAI_MODEL', 'gpt-oss-120b-f16');

  try {
    if (useGrant) {
      return await grantChatCompletion(messages, currentModel);
    }
    return getMockResponse(messages);
  } catch (err: any) {
    console.error('EigenAI error:', err.message);
    if (useModel !== fallbackModel) {
      console.warn(`Trying fallback model: ${fallbackModel}`);
      try {
        return await grantChatCompletion(messages, fallbackModel);
      } catch (fallbackErr: any) {
        console.error('Fallback also failed:', fallbackErr.message);
      }
    }
    return getMockResponse(messages);
  }
}

async function grantChatCompletion(messages: OpenAI.Chat.ChatCompletionMessageParam[], useModel: string): Promise<string> {
  const baseUrl = env('EIGENAI_BASE_URL', 'https://determinal-api.eigenarcade.com/api');
  const grantMessage = env('GRANT_MESSAGE');
  const grantSignature = env('GRANT_SIGNATURE');
  const grantWallet = env('GRANT_WALLET');

  console.log(`[EigenAI] ${useModel}`);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: useModel,
      max_tokens: 2000,
      temperature: 0,
      seed: 0,
      grantMessage,
      grantSignature,
      walletAddress: grantWallet,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[EigenAI] Error ${res.status}:`, errBody.slice(0, 200));
    throw new Error(`EigenAI ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data: any = await res.json();
  let content: string = data.choices?.[0]?.message?.content || '';

  // Strip model's internal analysis/channel tags if present
  const msgTag = content.lastIndexOf('<|message|>');
  if (msgTag !== -1) {
    content = content.slice(msgTag + '<|message|>'.length).trim();
  }
  // Strip any remaining tags
  content = content.replace(/<\|[^|]+\|>/g, '').trim();

  // Try to extract JSON from the response if it's wrapped in text
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    content = jsonMatch[0];
  }

  return content;
}

function getMockResponse(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const lastMessage = messages[messages.length - 1];
  const content = typeof lastMessage.content === 'string' ? lastMessage.content : '';

  if (content.includes('parse')) {
    const offerMatch = content.match(/structured terms:\s*"([\s\S]+)"$/i);
    const rawOffer = offerMatch ? offerMatch[1] : content;
    const parsedAmount = parseLatestAmount(rawOffer);
    const parsedTimeline = parseTimeline(rawOffer);
    const parsedDeliverables = parseDeliverables(rawOffer);
    const parsedService = parseService(rawOffer);
    return JSON.stringify({
      terms: {
        ...(parsedAmount.amount !== undefined ? { price: parsedAmount.amount } : {}),
        ...(parsedAmount.currency ? { currency: parsedAmount.currency } : {}),
        ...(parsedTimeline ? { timeline: parsedTimeline } : {}),
        ...(parsedService ? { service: parsedService } : {}),
        ...(parsedDeliverables ? { deliverables: parsedDeliverables } : {}),
        raw: rawOffer,
      },
      confidence: 0.8,
    });
  }
  if (content.includes('suggest')) {
    const latestLine = content
      .split('\n')
      .reverse()
      .find((line) => line.trim().length > 0) || '';
    return JSON.stringify({
      suggestion: `Focus on clarifying deliverables, timeline, payment, and completion before your next message. Latest context: ${latestLine.slice(0, 120)}`,
      suggested_terms: {},
    });
  }
  if (content.includes('convergence') || content.includes('analyze')) {
    return JSON.stringify({
      converging: true,
      gap_percentage: 15,
      recommendation: 'deal_likely',
    });
  }
  if (content.includes('condition') || content.includes('resolve') || content.includes('evaluate')) {
    return JSON.stringify({
      verdict: 'TRUE',
      confidence: 0.85,
      reasoning: 'Based on the provided data, the condition appears to be met.',
    });
  }
  if (content.includes('extract_contract_terms')) {
    const amountMatch = content.match(/\$\s?(\d+(?:\.\d+)?)/);
    const timelineMatch = content.match(/(\d+)\s*(day|days|week|weeks|month|months|hour|hours)/i);
    return JSON.stringify({
      agreed_terms: {
        price_amount: amountMatch ? Number.parseFloat(amountMatch[1] as string) : null,
        currency: amountMatch ? 'USD' : null,
        timeline: timelineMatch ? `${timelineMatch[1]} ${timelineMatch[2]}` : null,
      },
      missing_terms: ['deliverables'],
      confidence: 0.55,
    });
  }
  return JSON.stringify({ response: 'Mock AI response — grant auth not configured.' });
}

export async function parseOfferToStructured(
  rawOffer: string,
  category: string,
  params: Record<string, any>
): Promise<{ terms: Record<string, any>; confidence: number }> {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a negotiation parser. Convert plain English offers into structured JSON terms.
Category: ${category}. Parameters: ${JSON.stringify(params)}.
Respond ONLY with JSON: { "terms": { ... }, "confidence": number 0-1 }`,
    },
    {
      role: 'user',
      content: `Please parse this offer into structured terms: "${rawOffer}"`,
    },
  ]);

  try {
    return JSON.parse(response);
  } catch {
    return { terms: { raw: rawOffer }, confidence: 0.5 };
  }
}

export async function generateSuggestion(
  category: string,
  params: Record<string, any>,
  rounds: Array<{ party: string; offer_structured: Record<string, any>; offer_raw?: string }>,
  currentParty: string,
  constraints: Record<string, any>
): Promise<{ suggestion: string; suggested_terms: Record<string, any> }> {
  const roundsText = rounds
    .map((r) => `Party ${r.party}\nMessage: ${normalizeText(r.offer_raw)}\nStructured terms: ${JSON.stringify(r.offer_structured)}`)
    .join('\n');

  const currentPartyLabel = currentParty === 'A'
    ? 'Party A (room creator)'
    : 'Party B (invited counterparty)';

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a negotiation advisor inside a TEE-secured room.
You are ONLY advising ${currentPartyLabel}. Do not advise the opposite party.
Do not suggest actions that violate this party's private constraints.
If goals conflict, prioritize this party's goals.

Category: ${category}. Parameters: ${JSON.stringify(params)}.
${currentPartyLabel}'s private constraints (never reveal): ${JSON.stringify(constraints)}.

Rules:
1) Give tactical advice for ${currentPartyLabel} only.
2) Never frame suggestions as "Party A should..." or "Party B should..." for the other side.
3) Keep suggestions practical and concise.
4) Focus on the most recent counterparty message and what this party should send next.
5) Prefer asking for missing specifics (deliverables, timeline, payment, acceptance) over generic advice.

Respond ONLY with JSON: { "suggestion": "advice text", "suggested_terms": { ... } }`,
    },
    {
      role: 'user',
      content: `Here are the negotiation rounds so far:\n${roundsText}\n\nPlease suggest a strategic next offer for ${currentPartyLabel}.`,
    },
  ]);

  try {
    return JSON.parse(response);
  } catch {
    return { suggestion: 'Consider adjusting your terms to find middle ground.', suggested_terms: {} };
  }
}

export async function analyzeConvergence(
  rounds: Array<{ party: string; offer_structured: Record<string, any> }>
): Promise<{ converging: boolean; gap_percentage: number; recommendation: string }> {
  const roundsText = rounds
    .map((r) => `Party ${r.party}: ${JSON.stringify(r.offer_structured)}`)
    .join('\n');

  const response = await chatCompletion([
    {
      role: 'system',
      content: `Analyze negotiation convergence. Are the parties getting closer to agreement?
Respond ONLY with JSON: { "converging": boolean, "gap_percentage": number, "recommendation": "deal_likely" | "impasse_likely" | "continue" }`,
    },
    {
      role: 'user',
      content: `Analyze the convergence of these rounds:\n${roundsText}`,
    },
  ]);

  try {
    return JSON.parse(response);
  } catch {
    return { converging: false, gap_percentage: 50, recommendation: 'continue' };
  }
}

export async function evaluateCondition(
  condition: string,
  externalData: Record<string, any>
): Promise<{ verdict: string; confidence: number; reasoning: string }> {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a condition evaluator inside a TEE. Evaluate whether a contract condition is met based on external data.
Use step-by-step reasoning. Be precise.
Respond ONLY with JSON: { "verdict": "TRUE" | "FALSE", "confidence": number 0-1, "reasoning": "step by step..." }`,
    },
    {
      role: 'user',
      content: `Condition: "${condition}"\n\nExternal data: ${JSON.stringify(externalData)}\n\nEvaluate whether this condition is TRUE or FALSE.`,
    },
  ]);

  try {
    return JSON.parse(response);
  } catch {
    return { verdict: 'PENDING', confidence: 0, reasoning: 'Failed to evaluate condition.' };
  }
}

function pickScalar(record: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return undefined;
}

function normalizeText(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  try {
    return JSON.stringify(input);
  } catch {
    return '';
  }
}

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function pickFirstMeaningful(...values: unknown[]): unknown {
  for (const value of values) {
    if (isMeaningfulValue(value)) return value;
  }
  return null;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}

function mergeTerms(baseTerms: Record<string, any>, aiTerms: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...baseTerms };
  for (const [key, value] of Object.entries(aiTerms)) {
    if (!isMeaningfulValue(value)) continue;
    if (isMeaningfulValue(baseTerms[key])) continue;
    merged[key] = value;
  }
  return merged;
}

interface AmountCandidate {
  amount: number;
  currency: string;
  position: number;
}

const AGREEMENT_HINT_REGEX = /\b(agree|agreed|deal|done|works|proceed|confirmed|confirm|accept|let'?s do|sounds good|approved)\b/i;

function extractAmountCandidates(text: string): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  const usdRegex = /\$\s?(\d[\d,]*(?:\.\d+)?)/g;
  const tokenRegex = /(\d[\d,]*(?:\.\d+)?)\s*(usd|usdc|usdt|eth|eur|gbp)\b/gi;

  let usdMatch: RegExpExecArray | null;
  while ((usdMatch = usdRegex.exec(text)) !== null) {
    const amount = Number.parseFloat((usdMatch[1] as string).replace(/,/g, ''));
    if (!Number.isFinite(amount)) continue;
    candidates.push({
      amount,
      currency: 'USD',
      position: usdMatch.index,
    });
  }

  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRegex.exec(text)) !== null) {
    const amount = Number.parseFloat((tokenMatch[1] as string).replace(/,/g, ''));
    if (!Number.isFinite(amount)) continue;
    candidates.push({
      amount,
      currency: String(tokenMatch[2]).toUpperCase(),
      position: tokenMatch.index,
    });
  }

  return candidates;
}

function pickLatestCandidate(candidates: AmountCandidate[]): AmountCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => right.position - left.position)[0] || null;
}

function selectDominantAmount(
  rounds: Array<{ party: string; offer_raw?: string; offer_structured: Record<string, any> }>
): { amount?: number; currency?: string } {
  if (rounds.length === 0) return {};

  const roundSignals = rounds
    .map((round, index) => {
      const rawText = normalizeText(round.offer_raw);
      const sourceText = rawText.trim() ? rawText : normalizeText(round.offer_structured);
      const normalized = sourceText.trim();
      if (!normalized) return null;

      const candidates = extractAmountCandidates(normalized);
      if (candidates.length === 0) return null;

      return {
        index,
        sourceText: normalized,
        agreementHint: AGREEMENT_HINT_REGEX.test(normalized),
        candidates,
      };
    })
    .filter((item): item is { index: number; sourceText: string; agreementHint: boolean; candidates: AmountCandidate[] } => Boolean(item));

  if (roundSignals.length === 0) return {};

  const agreementSignals = roundSignals.filter((signal) => signal.agreementHint);
  if (agreementSignals.length > 0) {
    const latestAgreementRound = agreementSignals.sort((left, right) => right.index - left.index)[0];
    const latestAgreementCandidate = pickLatestCandidate(latestAgreementRound.candidates);
    if (latestAgreementCandidate) {
      return { amount: latestAgreementCandidate.amount, currency: latestAgreementCandidate.currency };
    }
  }

  const latestRoundWithAmount = roundSignals.sort((left, right) => right.index - left.index)[0];
  const latestCandidate = pickLatestCandidate(latestRoundWithAmount.candidates);
  if (!latestCandidate) return {};
  return { amount: latestCandidate.amount, currency: latestCandidate.currency };
}

function parseLatestAmount(text: string): { amount?: number; currency?: string } {
  const candidates = extractAmountCandidates(text);
  const latest = pickLatestCandidate(candidates);
  if (!latest) return {};
  return { amount: latest.amount, currency: latest.currency };
}

function parseTimeline(text: string): string | null {
  const match = text.match(/(\d+)\s*(business\s+)?(day|days|week|weeks|month|months|hour|hours)\b/i);
  if (!match) return null;
  const count = match[1];
  const unit = match[3];
  return `${count} ${unit}`;
}

function parseDeadline(text: string): string | null {
  const explicit = text.match(/\b(?:by|before|on)\s+([A-Z][a-z]{2,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2}|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i);
  if (explicit) return explicit[1] as string;
  return null;
}

function parseSchedule(text: string): string | null {
  const weekPattern = text.match(/\b(mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)(?:\s*(?:,|and)?\s*(mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?))*.*?\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b(?:\s*[A-Z]{2,4})?/i);
  if (weekPattern) return weekPattern[0] as string;

  const windowPattern = text.match(/\b(?:between|from)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)\s+(?:and|to)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);
  if (windowPattern) return windowPattern[0] as string;

  return null;
}

function parseDeliverables(text: string): string | null {
  const explicit = text.match(/\b(?:deliverables?|scope|output|work)\s*[:\-]\s*([^\n.;]+)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const intent = text.match(/\b(?:build|create|produce|deliver|label|write|design)\s+([^\n.!?]{8,100})/i);
  if (intent?.[1]) return intent[1].trim();

  return null;
}

function parsePaymentTerms(text: string): string | null {
  const explicit = text.match(/\b(?:payment(?:\s+terms?)?|escrow|milestones?)\s*[:\-]\s*([^\n.;]+)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const cue = text.match(/\b(?:upfront|escrow|after delivery|net\s*\d+|split payment|milestone)\b/i);
  if (cue) return cue[0] as string;

  return null;
}

function parseAcceptance(text: string): string | null {
  const explicit = text.match(/\b(?:acceptance(?:\s+criteria)?|verification|approval)\s*[:\-]\s*([^\n.;]+)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const cue = text.match(/\b(?:affirm|approve|done once|accepted when|release on)\b[^\n.!?]{0,120}/i);
  if (cue) return cue[0].trim();

  return null;
}

function parseService(text: string): string | null {
  const explicit = text.match(/\b(?:service|task|project|category)\s*[:\-]\s*([^\n.;]+)/i);
  if (explicit?.[1]) return explicit[1].trim();
  return null;
}

function computeMissingTerms(agreedTerms: Record<string, any>, dealType: string): string[] {
  const missing: string[] = [];
  if (!isMeaningfulValue(agreedTerms.deliverables)) missing.push('deliverables');
  if (!isMeaningfulValue(agreedTerms.price_amount)) missing.push('price');
  if (
    !isMeaningfulValue(agreedTerms.timeline) &&
    !isMeaningfulValue(agreedTerms.deadline) &&
    !isMeaningfulValue(agreedTerms.schedule)
  ) {
    missing.push('timeline_or_schedule');
  }

  if (dealType === 'conditional') {
    if (!isMeaningfulValue(agreedTerms.acceptance_criteria)) {
      missing.push('condition_or_resolution_rule');
    }
  }

  return missing;
}

function confidenceFromMissingCount(missingCount: number): number {
  if (missingCount === 0) return 0.9;
  if (missingCount === 1) return 0.78;
  if (missingCount === 2) return 0.64;
  return 0.5;
}

function buildHeuristicExtraction(rounds: Array<{ party: string; offer_raw?: string; offer_structured: Record<string, any> }>, dealType: string): {
  agreed_terms: Record<string, any>;
  missing_terms: string[];
  confidence: number;
} {
  const lastA = [...rounds].reverse().find((round) => round.party === 'A');
  const lastB = [...rounds].reverse().find((round) => round.party === 'B');
  const partyA = (lastA?.offer_structured || {}) as Record<string, any>;
  const partyB = (lastB?.offer_structured || {}) as Record<string, any>;

  const rawCorpus = rounds
    .map((round) => normalizeText(round.offer_raw))
    .filter((value) => value.trim())
    .join('\n');
  const structuredCorpus = rounds
    .map((round) => normalizeText(round.offer_structured))
    .filter((value) => value.trim())
    .join('\n');
  const combinedCorpus = `${rawCorpus}\n${structuredCorpus}`;

  const dominantAmount = selectDominantAmount(rounds);
  const fallbackAmount = dominantAmount.amount !== undefined
    ? dominantAmount
    : parseLatestAmount(rawCorpus || combinedCorpus);
  const fallbackTimeline = parseTimeline(rawCorpus) || parseTimeline(structuredCorpus) || parseTimeline(combinedCorpus);
  const fallbackDeadline = parseDeadline(rawCorpus) || parseDeadline(structuredCorpus) || parseDeadline(combinedCorpus);
  const fallbackSchedule = parseSchedule(rawCorpus) || parseSchedule(structuredCorpus) || parseSchedule(combinedCorpus);
  const fallbackDeliverables = parseDeliverables(rawCorpus) || parseDeliverables(structuredCorpus) || parseDeliverables(combinedCorpus);
  const fallbackPaymentTerms = parsePaymentTerms(rawCorpus) || parsePaymentTerms(structuredCorpus) || parsePaymentTerms(combinedCorpus);
  const fallbackAcceptance = parseAcceptance(rawCorpus) || parseAcceptance(structuredCorpus) || parseAcceptance(combinedCorpus);
  const fallbackService = parseService(rawCorpus) || parseService(structuredCorpus) || parseService(combinedCorpus);

  const agreedTerms: Record<string, any> = {
    service: pickFirstMeaningful(
      fallbackService,
      pickScalar(partyA, ['service', 'category', 'task', 'scope']),
      pickScalar(partyB, ['service', 'category', 'task', 'scope'])
    ),
    deliverables: pickFirstMeaningful(
      fallbackDeliverables,
      pickScalar(partyA, ['deliverables', 'output', 'scope', 'details']),
      pickScalar(partyB, ['deliverables', 'output', 'scope', 'details'])
    ),
    price_amount: pickFirstMeaningful(
      fallbackAmount.amount,
      pickScalar(partyA, ['price_amount', 'amount', 'price', 'fee', 'budget']),
      pickScalar(partyB, ['price_amount', 'amount', 'price', 'fee', 'budget'])
    ),
    currency: pickFirstMeaningful(
      fallbackAmount.currency,
      pickScalar(partyA, ['currency', 'token']),
      pickScalar(partyB, ['currency', 'token'])
    ),
    timeline: pickFirstMeaningful(
      fallbackTimeline,
      pickScalar(partyA, ['timeline', 'duration', 'turnaround']),
      pickScalar(partyB, ['timeline', 'duration', 'turnaround'])
    ),
    deadline: pickFirstMeaningful(
      fallbackDeadline,
      pickScalar(partyA, ['deadline', 'due_date', 'delivery_date']),
      pickScalar(partyB, ['deadline', 'due_date', 'delivery_date'])
    ),
    schedule: pickFirstMeaningful(
      fallbackSchedule,
      pickScalar(partyA, ['schedule', 'availability', 'time_window', 'timezone']),
      pickScalar(partyB, ['schedule', 'availability', 'time_window', 'timezone'])
    ),
    payment_terms: pickFirstMeaningful(
      fallbackPaymentTerms,
      pickScalar(partyA, ['payment_terms', 'escrow', 'payment_schedule']),
      pickScalar(partyB, ['payment_terms', 'escrow', 'payment_schedule'])
    ),
    acceptance_criteria: pickFirstMeaningful(
      fallbackAcceptance,
      pickScalar(partyA, ['acceptance', 'acceptance_criteria', 'verification']),
      pickScalar(partyB, ['acceptance', 'acceptance_criteria', 'verification'])
    ),
  };

  const missing = computeMissingTerms(agreedTerms, dealType);
  const confidence = confidenceFromMissingCount(missing.length);
  return {
    agreed_terms: agreedTerms,
    missing_terms: missing,
    confidence,
  };
}

export async function extractNegotiatedTerms(
  rounds: Array<{ party: string; offer_raw?: string; offer_structured: Record<string, any> }>,
  dealType: string,
  category: string
): Promise<{ agreed_terms: Record<string, any>; missing_terms: string[]; confidence: number }> {
  const heuristic = buildHeuristicExtraction(rounds, dealType);
  const roundsText = rounds
    .map((round) => `Party ${round.party}\nRaw: ${normalizeText(round.offer_raw)}\nStructured: ${normalizeText(round.offer_structured)}`)
    .join('\n---\n');

  const response = await chatCompletion([
    {
      role: 'system',
      content: `extract_contract_terms
You convert a negotiation chat into structured agreement terms.
Return ONLY JSON:
{
  "agreed_terms": {
    "service": string|null,
    "deliverables": string|null,
    "price_amount": number|null,
    "currency": string|null,
    "timeline": string|null,
    "deadline": string|null,
    "schedule": string|null,
    "payment_terms": string|null,
    "acceptance_criteria": string|null
  },
  "missing_terms": string[],
  "confidence": number
}`,
    },
    {
      role: 'user',
      content: `Deal type: ${dealType}
Category: ${category}
Negotiation transcript:
${roundsText}`,
    },
  ]);

  try {
    const parsed = JSON.parse(response) as {
      agreed_terms?: Record<string, any>;
      missing_terms?: unknown;
      confidence?: unknown;
    };
    const aiTerms = parsed.agreed_terms && typeof parsed.agreed_terms === 'object'
      ? parsed.agreed_terms
      : {};
    const merged = mergeTerms(heuristic.agreed_terms, aiTerms);
    const aiMissingTerms = Array.isArray(parsed.missing_terms)
      ? parsed.missing_terms.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const computedMissing = computeMissingTerms(merged, dealType);
    const missingTerms = uniqueStrings([...aiMissingTerms, ...computedMissing]);
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : confidenceFromMissingCount(missingTerms.length);

    return {
      agreed_terms: merged,
      missing_terms: missingTerms,
      confidence,
    };
  } catch {
    return heuristic;
  }
}

function extractSummaryTerms(terms: Record<string, any>): Record<string, any> {
  if (terms?.agreed_terms && typeof terms.agreed_terms === 'object') {
    return terms.agreed_terms as Record<string, any>;
  }
  return terms;
}

function formatSummaryTermSnippet(terms: Record<string, any>): string {
  const source = extractSummaryTerms(terms);
  const primitiveEntries = Object.entries(source || {}).filter(([, value]) => {
    const valueType = typeof value;
    return valueType === 'string' || valueType === 'number' || valueType === 'boolean';
  });

  if (primitiveEntries.length === 0) {
    return '';
  }

  return primitiveEntries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}

function buildSummaryFallback(terms: Record<string, any>, dealType: string, category: string): string {
  const cleanedCategory = category || 'general work';
  const snippet = formatSummaryTermSnippet(terms);
  const detail = snippet
    ? `Key terms include ${snippet}.`
    : 'Final offers from both parties are preserved in the contract record.';

  if (dealType === 'conditional') {
    return `This conditional contract covers ${cleanedCategory}. ${detail} Resolution is completed through attested condition checks.`;
  }

  return `This service contract covers ${cleanedCategory}. ${detail} The service receiver can affirm completion to release escrow in demo mode.`;
}

function normalizeSummaryResponse(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { summary?: unknown };
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        candidate = parsed.summary.trim();
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const collapsed = candidate.replace(/\s+/g, ' ').trim();
  const blockedFragments = [
    'respond only with json',
    'we need to produce a summary',
    'probably just note',
    '"summary"',
  ];
  if (blockedFragments.some((fragment) => collapsed.toLowerCase().includes(fragment))) {
    return null;
  }

  if (collapsed.length > 320) {
    return `${collapsed.slice(0, 317).trimEnd()}.`;
  }

  return collapsed;
}

export async function generateContractSummary(
  terms: Record<string, any>,
  dealType: string,
  category: string
): Promise<string> {
  const fallback = buildSummaryFallback(terms, dealType, category);
  const response = await chatCompletion([
    {
      role: 'system',
      content: `Generate a clear, concise human-readable summary of this contract.
Keep it to at most 2 sentences.
Do not include analysis steps or instructions.
Respond ONLY with JSON: { "summary": "..." }`,
    },
    {
      role: 'user',
      content: `Deal type: ${dealType}, Category: ${category}, Terms: ${JSON.stringify(terms)}`,
    },
  ]);

  return normalizeSummaryResponse(response) || fallback;
}
