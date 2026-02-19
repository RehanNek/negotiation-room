# Signet (The Room)

Private deal rooms + verifiable contract evidence, running on EigenCompute.

Last updated: 2026-02-19

## Production Snapshot

- Website: [the-room-smoky.vercel.app](https://the-room-smoky.vercel.app)
- EigenCompute app: `0x28B7Cbf332E7e1711C11bf1472114b76793B37A8`
- Backend health (direct): `http://136.109.58.88:3000/health`
- Runtime commits currently in use:
  - backend: `2e8ca291028686c045733859010cd96221a10ba4`
  - frontend: `33ca0a0`
- Latest known verifiable backend release metadata:
  - release: `21`
  - provenance: `prov-ok sig-ok deps:2`

Dashboard: [verify-sepolia.eigencloud.xyz/app/0x28B7Cbf332E7e1711C11bf1472114b76793B37A8](https://verify-sepolia.eigencloud.xyz/app/0x28B7Cbf332E7e1711C11bf1472114b76793B37A8)

## What The App Does

1. 1:1 wallet-auth deal rooms with per-party private constraints.
2. Dual-confirm `done` flow (both parties must confirm same terms hash).
3. Structured service/conditional contracts.
4. Optional Sepolia escrow prepare/fund/settle/refund flow.
5. Attestation-based evidence for contract outcomes.
6. Reputation tracking by wallet deal behavior.

Home UX note:

- Reputation tier badges (for example `Unproven`) are intentionally hidden on the Overview page and shown in Profile/diagnostics contexts.

## Escrow Semantics (Service Deals)

Service deals are modeled as:

1. The service receiver (client/buyer/requester) is the default payer.
2. Funds move from payer wallet -> escrow contract on funding.
3. On `TRUE`/service affirmation, escrow releases to service provider.
4. On `FALSE` or timeout refund path, escrow returns to payer.

UI now reflects this explicitly in Contracts:

- `Payer`
- `Release to provider`
- `Refund back to payer`

## Trust Upgrade (vNext) Status

Implemented:

1. Publicly verifiable attestations (EIP-712, not backend-trust-only HMAC).
2. Browser-local verification in `/verify` (payload canonicalization + hash + signature recovery/verification).
3. Endpoint-aware privacy routing (`NEXT_PUBLIC_API_URL` for non-auth routes, `/auth/*` proxy-compatible).
4. Verifiable backend release path using `ecloud ... --verifiable`.
5. Performance hardening:
   - removed N+1 escrow fetch in contract wallet listing
   - removed scheduler N+1 attestation lookup
   - added contract/escrow/attestation indexes

## Attestation Model

`GET /attestation/:id` is the verification source of truth.

Returned verification fields include:

- `data_hash`, `hash_algo` (`sha256-rfc8785`)
- `signature`, `sig_type` (`eip712`)
- `signer_wallet`
- `sig_domain`, `sig_types`, `sig_message`
- legacy `tee_signature` alias (kept for compatibility)

`GET /attestation/:id/verify` is compatibility-only. UI must not treat it as authority.

## API Routing and Privacy (Client)

Client behavior:

- `/auth/*` -> `/api/*` proxy-compatible path
- non-auth business routes -> direct `NEXT_PUBLIC_API_URL` when set
- localhost -> local fallback

Implementation file: `/Users/rehannek/Documents/Negotiation room/client/src/lib/api.ts`.

## Verification Flow

Browser `/verify` flow:

1. Fetch `GET /attestation/:id`
2. Canonicalize payload (`json-canonicalize`)
3. Compute `sha256-rfc8785`
4. Verify EIP-712 signature and recovered signer
5. Render explicit Valid/Invalid diagnostics

Additional behavior:

- If a pasted attestation ID is stale for a resolved contract, the page attempts to load the most relevant latest attestation for that contract before rendering the verdict.

Offline verification script (same cryptographic checks):

```bash
cd server
npm run verify:attestation -- /path/to/attestation.json
```

## API Reference (Core)

| Method | Endpoint | Notes |
| --- | --- | --- |
| POST | `/auth/challenge` | wallet challenge |
| POST | `/auth/verify` | signed challenge -> bearer token |
| POST | `/auth/demo` | demo session (if enabled) |
| GET | `/auth/me` | validate token |
| POST | `/negotiate/create` | create room |
| POST | `/negotiate/join` | join room |
| POST | `/negotiate/offer` | submit offer |
| POST | `/negotiate/done` | dual-confirm close |
| POST | `/negotiate/walkaway` | close without deal |
| GET | `/negotiate/status/:id` | deal-room state |
| GET | `/contract/:id` | contract details |
| GET | `/contract/wallet/:wallet` | list contracts |
| POST | `/contract/:id/resolve` | conditional resolution |
| POST | `/contract/:id/affirm` | service affirmation |
| POST | `/contract/:id/escrow/prepare` | escrow prepare |
| POST | `/contract/:id/escrow/funded` | funding proof |
| GET | `/contract/:id/escrow` | escrow state |
| GET | `/reputation/:wallet` | wallet reputation |
| GET | `/reputation/leaderboard` | leaderboard |
| GET | `/attestation/:id` | attestation source of truth |
| GET | `/attestation/:id/verify` | compatibility endpoint |

Protected endpoints require:

```http
Authorization: Bearer <token>
```

## Local Development

### 1) Server

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 2) Client

```bash
cd client
npm install
npm run dev
```

## Environment Variables

### Server (`server/.env`)

- `PORT` (default `3000`)
- `DATABASE_PATH`
- `AUTH_DEMO_MODE`
- `CORS_ALLOWED_ORIGINS` (comma-separated allowlist)
- `ESCROW_CHAIN_ID` (default `11155111`)
- `ESCROW_VERIFIER_PRIVATE_KEY` (used for EIP-712 attestation signing identity)

Important:

- If `ESCROW_VERIFIER_PRIVATE_KEY` is not set, code falls back to a built-in dev key.
- Do not rely on fallback key in production.

### Client (`client/.env.local`)

- `NEXT_PUBLIC_API_URL` (recommended HTTPS backend URL)
- `NEXT_PUBLIC_ESCROW_EXPLORER_BASE_URL` (optional, defaults to Sepolia Etherscan tx URL)

## Verifiable Deployment Runbook

Prerequisites:

1. `ecloud auth whoami` shows the wallet you want to deploy with.
2. `ecloud billing status` shows active compute subscription.
3. EigenCloud GitHub App is installed and has access to this repo.

Deploy from pinned commit:

```bash
ecloud compute app upgrade <APP_ID> \
  --environment sepolia \
  --verifiable \
  --repo https://github.com/<owner>/<repo>.git \
  --commit <sha> \
  --build-context server \
  --build-dockerfile Dockerfile \
  --env-file server/.env
```

Frontend production deploy:

```bash
cd client
npx vercel --prod
```

Verify release metadata:

```bash
ecloud compute app releases <APP_ID> --environment sepolia
ecloud compute build info <BUILD_ID>
```

## Repo Layout

```text
client/                  Next.js app
server/                  Express/TypeScript backend
contracts/               Hardhat escrow contract workspace
docs/openclaw-runbook.md API-first execution runbook
skill/skill.md           OpenClaw skill instructions
prd.md                   Product requirements
```

## Related Docs

- `/Users/rehannek/Documents/Negotiation room/client/README.md`
- `/Users/rehannek/Documents/Negotiation room/docs/openclaw-runbook.md`
- `/Users/rehannek/Documents/Negotiation room/skill/skill.md`
- `/Users/rehannek/Documents/Negotiation room/prd.md`
