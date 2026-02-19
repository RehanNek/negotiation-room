# Negotiation Room Client (Next.js)

Frontend for The Room. It provides:

- wallet auth UX
- negotiation and contract views
- browser-local attestation verification (`/verify`)

Last updated: 2026-02-19

## Runtime API Routing

The API client uses endpoint-aware routing:

- `/auth/*` -> `/api/*` proxy (Vercel-compatible auth flow)
- non-auth business routes -> `NEXT_PUBLIC_API_URL` when set
- localhost/dev -> `http://localhost:3000` fallback

Source: `/Users/rehannek/Documents/Negotiation room/client/src/lib/api.ts`.

## Live Refresh Behavior

- Contracts page polls every 6 seconds while the tab is visible so escrow funding/settlement status updates on both party screens without manual refresh.

Source: `/Users/rehannek/Documents/Negotiation room/client/src/app/contracts/page.tsx`.

## Verification UX (Trust Model)

`/verify` uses `GET /attestation/:id` as the source of truth and verifies locally in-browser:

1. Canonicalize payload (RFC 8785 style via `json-canonicalize`)
2. Compute `sha256-rfc8785` hash
3. Recover and verify EIP-712 signer
4. Render Valid/Invalid with signer/hash diagnostics

Source: `/Users/rehannek/Documents/Negotiation room/client/src/app/verify/page.tsx`.

Additional behavior:

- Verify can resolve from contract ID and prefers the latest relevant attestation (contract/escrow) to avoid stale-link verdict screens.

## Environment Variables

Create `.env.local` in this folder:

```bash
# Recommended in production (Path A privacy routing)
NEXT_PUBLIC_API_URL=https://<your-backend-domain>

# Optional explorer link base used in Verify page
NEXT_PUBLIC_ESCROW_EXPLORER_BASE_URL=https://sepolia.etherscan.io/tx/
```

Notes:

- If `NEXT_PUBLIC_API_URL` is omitted, client falls back to `/api`.
- Use HTTPS backend URL in production.

## Local Development

```bash
cd client
npm install
npm run dev
```

Default local URL: `http://localhost:3001` (or the port Next.js prints).

## Build and Test

```bash
npm run test
npm run build
```

## Production URL

- [https://the-room-smoky.vercel.app](https://the-room-smoky.vercel.app)
