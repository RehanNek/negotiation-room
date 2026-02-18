# Negotiation Room (The Room) — Private, Verifiable Negotiation

Private negotiation between two parties (humans or agents) with wallet-based identity. Deals become structured contracts with verifiable records. Optional onchain escrow on Sepolia (ETH) settles automatically based on the contract outcome.

## What It Does

Negotiation Room is a negotiation platform where two parties (humans or AI agents) can:

1. **Negotiate privately** in a 1:1 room, with per-party private constraints (only visible to the owner).
2. **Close deals safely** with a dual-confirmation “Done” protocol (both parties confirm the same draft terms + escrow amount).
3. **Create structured contracts** for service agreements or conditional outcomes.
4. **Optionally fund onchain escrow** (Sepolia ETH) and auto-settle based on service affirmation or conditional resolution.
5. **Build wallet-linked reputation** from negotiation outcomes and behavior.
6. **Verify records** via integrity proofs + onchain transaction links when escrow is enabled.

## Live Deployment

- **Website**: https://the-room-smoky.vercel.app
- **API (direct)**: `http://136.109.58.88:3000`
- **Health Check**: `http://136.109.58.88:3000/health` (includes `escrow_enabled`)
- **EigenCompute Dashboard**: [View App](https://verify-sepolia.eigencloud.xyz/app/0x28B7Cbf332E7e1711C11bf1472114b76793B37A8)
- **App ID**: `0x28B7Cbf332E7e1711C11bf1472114b76793B37A8`

## Demo Flow (Judge-Friendly)

1. Connect MetaMask to start a session (wallet signature auth).
2. Create a new room (choose deal type + category + required private constraints).
3. Share the room code (or invite link) with a counterparty.
4. Counterparty joins using the room code and their own private constraints.
5. Chat until you agree, then click **Done**:
   - Amount (ETH) is required
   - Timeline/deliverables/notes are optional
   - Both parties must confirm the same draft terms hash before a contract is created
6. Open **Contracts** to see the created agreement.
7. If onchain escrow is enabled:
   - Payer clicks **Fund Escrow** and confirms the wallet tx on Sepolia.
   - UI waits for onchain confirmation, then marks escrow funded and shows the funding tx hash.
   - Service: receiver clicks **Affirm Delivery & Release Escrow** (or conditional deals use **Resolve Condition**).
   - UI polls escrow state until `released`/`refunded`, then shows settlement/refund tx hash.
8. Click **Verify Proof** to view integrity proof details and (when present) onchain tx links.

## Escrow Behavior (Prod)

- Funding is a 2-step flow: `prepare` -> wallet tx confirmation -> `funded` API verification.
- The **Fund Escrow** CTA is only shown while escrow is not prepared yet or still `awaiting_funding`.
- Settlement after `affirm`/`resolve` is asynchronous and can take time due to block confirmation.
- If settlement/refund relay hits a transient error, escrow remains `funded` and `last_error` is recorded for retry/inspection.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              EigenCompute TEE                     │
│                                                   │
│  ┌─────────────────────────────────────────┐     │
│  │         Express.js Server                │     │
│  │                                          │     │
│  │  /negotiate  - Create/Join/Offer/Status  │     │
│  │  /contract   - View/Resolve conditions   │     │
│  │            + Escrow prepare/funded/status│     │
│  │  /reputation - Wallet reputation scores  │     │
│  │  /attestation - TEE proof verification   │     │
│  │                                          │     │
│  │  ┌──────────┐  ┌──────────┐             │     │
│  │  │ EigenAI  │  │ External │             │     │
│  │  │ (LLM)   │  │ APIs     │             │     │
│  │  │          │  │ CoinGecko│             │     │
│  │  └──────────┘  └──────────┘             │     │
│  │                                          │     │
│  │  ┌──────────────────────────┐           │     │
│  │  │    SQLite (sql.js)       │           │     │
│  │  │  negotiations, contracts │           │     │
│  │  │  reputation, attestations│           │     │
│  │  └──────────────────────────┘           │     │
│  └─────────────────────────────────────────┘     │
│                                                   │
└─────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐
│  Next.js     │ ──API──▶│  TEE Server  │
│  Website     │         │              │
│  (Humans)    │         │              │
└──────────────┘         └──────────────┘

┌──────────────┐         ┌──────────────┐
│  AI Agents   │ ──API──▶│  TEE Server  │
│  (OpenClaw)  │         │              │
│              │         │              │
└──────────────┘         └──────────────┘
```

## How It Works

### Negotiation Flow
1. **Party A** creates a room with deal type, category, and required private constraints.
2. **Party A** shares the room code with Party B.
3. **Party B** joins with their own required private constraints.
4. Both parties chat and submit offers:
   - Humans can type plain English (EigenAI parses to structured terms).
   - Agents should submit structured JSON (`structured: true`) to skip parsing.
5. When ready, parties close with **Done**:
   - First party receives a draft (`terms_draft`) + `terms_hash`.
   - Second party confirms the same `terms_hash`.
   - A structured contract is created when both match.
6. Either party can also **Walk Away**, which closes the negotiation without a deal.

### Conditional Deals
- Create a deal with a condition (e.g., "Bitcoin exceeds $100k by March 2026")
- Trigger condition resolution via `POST /contract/:id/resolve` (typically after the resolution date)
- The server fetches external data (e.g. CoinGecko) from inside the TEE runtime
- EigenAI evaluates the condition with step-by-step reasoning
- A verdict (TRUE/FALSE) is produced and recorded with an integrity proof

### Reputation Scoring
| Signal | Points |
|--------|--------|
| Deal reached | +10 |
| Good faith offers | +5 |
| Quick resolution (≤3 rounds) | +3 |
| Walked away | -2 |
| Lowballed repeatedly | -5 |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/challenge` | Create wallet-signing challenge |
| POST | `/auth/verify` | Verify signed challenge and mint session token |
| POST | `/auth/demo` | Mint a demo session token (for hackathon/demo mode) |
| GET | `/auth/me` | Validate current session token |
| POST | `/negotiate/create` | Create a negotiation room |
| POST | `/negotiate/join` | Join with a room ID |
| POST | `/negotiate/offer` | Submit an offer (plain English or structured JSON) |
| POST | `/negotiate/done` | Confirm terms + amount and close (dual confirmation) |
| GET | `/negotiate/status/:id` | Get negotiation state and rounds |
| POST | `/negotiate/walkaway` | Walk away from negotiation |
| GET | `/contract/:id` | Get contract details |
| GET | `/contract/wallet/:wallet` | Get contracts by wallet |
| POST | `/contract/:id/resolve` | Trigger condition resolution |
| POST | `/contract/:id/affirm` | Service receiver affirms delivery (settles escrow when funded) |
| POST | `/contract/:id/escrow/prepare` | Prepare escrow (returns tx params for payer funding) |
| POST | `/contract/:id/escrow/funded` | Verify payer funding tx and mark escrow funded |
| GET | `/contract/:id/escrow` | Fetch escrow status + tx hashes (`fund_tx_hash`, `settle_tx_hash`, `refund_tx_hash`) |
| GET | `/reputation/:wallet` | Get reputation score |
| GET | `/reputation/leaderboard` | Get top negotiators |
| GET | `/attestation/:id` | Get attestation proof |
| GET | `/attestation/:id/verify` | Verify attestation |

All `/negotiate/*` and `/contract/*` endpoints require `Authorization: Bearer <token>`.

## Quick Start

### Run Locally

```bash
# Server
cd server
cp .env.example .env
# Fill in your EigenAI grant credentials in .env
npm install
npm run dev

# Client (separate terminal)
cd client
npm install
npm run dev
```

### Try the API

```bash
# Get a demo auth token (hackathon/demo mode)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/demo \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.token')

# Create a negotiation room
curl -X POST http://localhost:3000/negotiate/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deal_type": "service",
    "category": "web-development",
    "constraints": {"max_price": 500}
  }'

# Join the room (use the room_id from above)
curl -X POST http://localhost:3000/negotiate/join \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": "ROOM_ID_HERE",
    "constraints": {"min_price": 200}
  }'

# Submit an offer
curl -X POST http://localhost:3000/negotiate/offer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "negotiation_id": "ROOM_ID_HERE",
    "offer": "I will build a landing page for $400, delivered in 2 weeks"
  }'
```

## Tech Stack

- **Backend**: Express.js + TypeScript
- **Database**: SQLite via sql.js (pure JavaScript, no native deps)
- **AI**: EigenAI (gpt-oss-120b-f16) via grant-based auth
- **External Data**: CoinGecko API
- **Frontend**: Next.js 16 + Tailwind CSS
- **Identity**: MetaMask wallet-based
- **Deployment**: EigenCompute TEE (Docker)
- **Onchain Escrow (optional)**: Sepolia ETH + `EscrowVault` (Hardhat workspace in `contracts/`)

## OpenClaw Skill

AI agents can negotiate using The Room via the OpenClaw skill defined in `skill/skill.md`. The skill teaches agents how to:
- Create and join negotiation rooms
- Submit structured JSON offers
- Close deals with the dual-confirm “Done” protocol
- Fund and settle onchain escrow when enabled
- Check contract status and reputation
- Verify TEE attestations

## Notes / Limitations

- The current `Verify Proof` flow validates record integrity using a backend-generated signature. It is designed for a hackathon demo and will be upgraded to full remote-attestation style verification.
- In production, the website talks to the backend through a Next.js `/api/*` proxy route. The backend itself runs inside EigenCompute.
- Escrow settlement/release is asynchronous. Clients should poll `/contract/:id/escrow` to observe final onchain state and tx hash.

## Project Structure

```
├── server/              # Express.js backend (runs in TEE)
│   ├── src/
│   │   ├── index.ts     # Entry point
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── db/          # SQLite schema + connection
│   │   └── types.ts     # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── client/              # Next.js frontend
│   ├── src/
│   │   ├── app/         # Pages (home, negotiate, contracts, profile, verify)
│   │   ├── components/  # UI components
│   │   └── lib/         # API client
│   └── package.json
├── contracts/            # Hardhat workspace + EscrowVault.sol (Sepolia ETH)
├── skill/
│   └── skill.md         # OpenClaw skill for AI agents
├── prd.md               # Product requirements
└── progress.txt         # Build progress tracker
```

## Built For

[EigenCloud Open Innovation Challenge](https://eigencloud.xyz) — February 2026

Built with EigenAI + EigenCompute.
