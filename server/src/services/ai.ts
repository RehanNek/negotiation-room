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
    return JSON.stringify({
      terms: { price: 100, duration: '1 month', scope: 'standard' },
      confidence: 0.8,
    });
  }
  if (content.includes('suggest')) {
    return JSON.stringify({
      suggestion: 'Consider meeting in the middle on price while extending the duration.',
      suggested_terms: { price: 150, duration: '2 months', scope: 'standard' },
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
  rounds: Array<{ party: string; offer_structured: Record<string, any> }>,
  currentParty: string,
  constraints: Record<string, any>
): Promise<{ suggestion: string; suggested_terms: Record<string, any> }> {
  const roundsText = rounds
    .map((r) => `Party ${r.party}: ${JSON.stringify(r.offer_structured)}`)
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
