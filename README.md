# The Room — Verifiable Negotiation Infrastructure

Private deals, conditional contracts, and provable fairness — all running inside a TEE on EigenCloud.

## What It Does

The Room is a negotiation platform where two parties (humans or AI agents) can:

1. **Negotiate deals** — Service contracts or conditional bets, with private constraints that stay secret
2. **Auto-resolve conditions** — Conditional deals fetch real-world data (crypto prices, news) and produce TEE-attested verdicts
3. **Build reputation** — Every negotiation contributes to a wallet-linked reputation score
4. **Verify everything** — All contract resolutions are attested inside a Trusted Execution Environment

## Live Deployment

- **Website**: https://the-room-smoky.vercel.app
- **API**: `http://136.109.58.88:3000`
- **Health Check**: `http://136.109.58.88:3000/health`
- **EigenCompute Dashboard**: [View App](https://verify-sepolia.eigencloud.xyz/app/0x28B7Cbf332E7e1711C11bf1472114b76793B37A8)
- **App ID**: `0x28B7Cbf332E7e1711C11bf1472114b76793B37A8`

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
1. **Party A** creates a room with deal type, category, and private constraints
2. **Party A** shares the room ID with Party B
3. **Party B** joins with their own private constraints
4. Both parties submit offers (up to 5 rounds):
   - Humans type in plain English — EigenAI parses it to structured terms
   - AI agents submit structured JSON directly
5. The system detects convergence → **DEAL** / max rounds → **IMPASSE** / walk away → **NO DEAL**
6. A structured contract is created with TEE attestation

### Conditional Deals
- Create a deal with a condition (e.g., "Bitcoin exceeds $100k by March 2026")
- When the resolution date arrives, trigger condition check
- The server fetches live data from CoinGecko inside the TEE
- EigenAI evaluates the condition with step-by-step reasoning
- A TEE-attested verdict (TRUE/FALSE) is produced

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
| GET | `/negotiate/status/:id` | Get negotiation state and rounds |
| POST | `/negotiate/walkaway` | Walk away from negotiation |
| GET | `/contract/:id` | Get contract details |
| GET | `/contract/wallet/:wallet` | Get contracts by wallet |
| POST | `/contract/:id/resolve` | Trigger condition resolution |
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

## OpenClaw Skill

AI agents can negotiate using The Room via the OpenClaw skill defined in `skill/skill.md`. The skill teaches agents how to:
- Create and join negotiation rooms
- Submit structured JSON offers
- Check contract status and reputation
- Verify TEE attestations

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
├── skill/
│   └── skill.md         # OpenClaw skill for AI agents
├── prd.md               # Product requirements
└── progress.txt         # Build progress tracker
```

## Built For

[EigenCloud Open Innovation Challenge](https://eigencloud.xyz) — February 2026

Built with EigenAI + EigenCompute.
