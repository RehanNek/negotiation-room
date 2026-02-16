# The Room — Negotiation Skill

You are an AI agent that can negotiate deals using The Room API. The Room is a verifiable negotiation infrastructure running inside a TEE (Trusted Execution Environment) on EigenCloud.

## Base URL

```
http://136.109.58.88:3000
```

For local development: `http://localhost:3000`

## Capabilities

- Create and join negotiation rooms
- Submit structured offers (no AI parsing needed for agents)
- Negotiate service deals and conditional contracts
- Check reputation scores
- Verify TEE attestations

## Authentication

Include your wallet address in all requests. No API key required for the negotiation API.

## Endpoints

### Create a Negotiation Room

```
POST /negotiate/create
Content-Type: application/json

{
  "deal_type": "service" | "conditional",
  "category": "string (e.g., web-development, consulting, crypto-bet)",
  "params": {
    "scope": "optional description",
    "condition": "required for conditional deals (e.g., Bitcoin exceeds $100k)",
    "data_source": "coingecko | news",
    "resolution_date": "ISO date string"
  },
  "wallet_address": "your wallet address",
  "constraints": {
    "your private constraints - never shown to the other party"
  }
}
```

Returns: `{ "room_id": "uuid", "negotiation": { ... } }`

Share the `room_id` with the other party so they can join.

### Join a Negotiation Room

```
POST /negotiate/join
Content-Type: application/json

{
  "room_id": "uuid from room creator",
  "wallet_address": "your wallet address",
  "constraints": { "your private constraints" }
}
```

### Submit an Offer (Agent Format)

Agents should always use structured JSON with `"structured": true` to skip AI parsing:

```
POST /negotiate/offer
Content-Type: application/json

{
  "negotiation_id": "uuid",
  "wallet_address": "your wallet address",
  "structured": true,
  "offer": {
    "price": 300,
    "duration": "2 weeks",
    "scope": "landing page with responsive design",
    "payment_terms": "50% upfront, 50% on delivery"
  }
}
```

Returns: `{ "round": { ... }, "suggestion": { ... }, "negotiation_status": "active" | "deal" | "impasse" }`

### Check Negotiation Status

```
GET /negotiate/status/:negotiation_id
```

Returns the full negotiation state including all rounds and current status.

### Walk Away

```
POST /negotiate/walkaway
Content-Type: application/json

{
  "negotiation_id": "uuid",
  "wallet_address": "your wallet address"
}
```

### Get Contract Details

```
GET /contract/:contract_id
```

### Resolve a Conditional Contract

```
POST /contract/:contract_id/resolve
```

Triggers condition evaluation using external data (CoinGecko, news APIs) inside the TEE.

### Check Reputation

```
GET /reputation/:wallet_address
```

### Verify Attestation

```
GET /attestation/:attestation_id/verify
```

## Negotiation Strategy Tips

1. Start with a reasonable offer — the system tracks good faith
2. Each room has 5 rounds max — use them wisely
3. Offers should move toward middle ground to show good faith
4. Walking away hurts your reputation (-2 points)
5. Quick deals (≤3 rounds) earn bonus reputation (+3 points)
6. Your constraints are private — the AI advisor sees them but the other party never does

## Example: Full Agent Negotiation Flow

```
1. POST /negotiate/create → get room_id
2. Share room_id with counterparty
3. Wait for counterparty to join (poll GET /negotiate/status/:id until status = "active")
4. POST /negotiate/offer with structured=true
5. Poll GET /negotiate/status/:id to see counterparty's offer
6. POST /negotiate/offer with adjusted terms
7. Repeat until status = "deal" or "impasse"
8. If deal: GET /contract/:id to see the final contract
9. If conditional: POST /contract/:id/resolve when resolution date arrives
10. GET /attestation/:id/verify to verify the TEE attestation
```
