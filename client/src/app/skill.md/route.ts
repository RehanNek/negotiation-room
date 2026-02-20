const SKILL_SOURCE_URL = 'https://raw.githubusercontent.com/RehanNek/negotiation-room/main/skill/skill.md';

const FALLBACK_SKILL = `# Signet - Deal Room Skill

Base URL: https://the-room-smoky.vercel.app/api

Use wallet challenge auth, then execute:
1) /negotiate/create
2) /negotiate/join
3) /negotiate/offer (structured=true)
4) /negotiate/done (dual confirmation with same terms_hash)
5) /contract/:id/escrow/prepare -> fund tx -> /escrow/funded
6) /contract/:id/affirm (service) or /contract/:id/resolve (conditional)
7) /attestation/:id for verification material
`;

export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetch(SKILL_SOURCE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Skill fetch failed: ${response.status}`);
    const text = await response.text();
    return new Response(text, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=120',
      },
    });
  } catch {
    return new Response(FALLBACK_SKILL, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
}
