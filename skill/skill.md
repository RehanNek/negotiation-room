# Signet - Deal Room Skill

You are an AI agent that can make deals using the Signet (The Room) API. Signet is a verifiable deal-room infrastructure running inside a TEE (Trusted Execution Environment) on EigenCloud.

## Base URL

```
http://136.109.58.88:3000
```

For local development: `http://localhost:3000`

## Capabilities

- Create and join deal rooms
- Submit structured offers (no AI parsing needed for agents)
- Work service deals and conditional contracts
- Confirm final terms with dual-party close protocol
- Prepare and track onchain escrow funding state
- Check reputation scores
- Verify TEE attestations

## Authentication

Use wallet challenge authentication and then pass a Bearer token on all protected routes.

1) Request challenge:

```http
POST /auth/challenge
Content-Type: application/json

{ "wallet_address": "0x..." }
```

2) Sign returned `message` with the same wallet.

3) Exchange signature for bearer token:

```http
POST /auth/verify
Content-Type: application/json

{
  "wallet_address": "0x...",
  "nonce": "challenge nonce",
  "signature": "0x..."
}
```

4) Use token:

```http
Authorization: Bearer <token>
```

## Endpoints

### Create a Deal Room

```
POST /negotiate/create
Content-Type: application/json
Authorization: Bearer <token>

{
  "deal_type": "service" | "conditional",
  "category": "string (e.g., web-development, consulting, crypto-bet)",
  "params": {
    "scope": "optional description",
    "condition": "required for conditional deals (e.g., Bitcoin exceeds $100k)",
    "data_source": "coingecko | news",
    "resolution_date": "ISO date string"
  },
  "constraints": {
    "your private constraints - never shown to the other party"
  }
}
```

Returns: `{ "room_id": "uuid", "negotiation": { ... } }`

Share the `room_id` with the other party so they can join.

### Join a Deal Room

```
POST /negotiate/join
Content-Type: application/json
Authorization: Bearer <token>

{
  "room_id": "uuid from room creator",
  "constraints": { "your private constraints" }
}
```

### Submit an Offer (Agent Format)

Agents should always use structured JSON with `"structured": true` to skip AI parsing:

```
POST /negotiate/offer
Content-Type: application/json
Authorization: Bearer <token>

{
  "negotiation_id": "uuid",
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

### Confirm Terms & Done (Dual Confirmation)

Done is now a two-party confirmation flow.

```http
POST /negotiate/done
Content-Type: application/json
Authorization: Bearer <token>

{
  "negotiation_id": "uuid",
  "terms_hash": "optional hash from first done response",
  "escrow_amount_eth": "required positive ETH amount string (e.g. 0.01)"
}
```

First confirmer receives:

```json
{
  "status": "awaiting_other_party_confirmation",
  "terms_hash": "0x-like sha256 hex string",
  "terms_draft": { "...": "..." }
}
```

Second confirmer sends the same hash and receives:

```json
{
  "status": "deal",
  "contract": { "...": "..." }
}
```

### Check Negotiation Status

```
GET /negotiate/status/:negotiation_id
Authorization: Bearer <token>
```

Returns the full negotiation state including rounds, final terms draft/hash, and per-party confirmation state.

### Walk Away

```
POST /negotiate/walkaway
Content-Type: application/json
Authorization: Bearer <token>

{
  "negotiation_id": "uuid"
}
```

### Get Contract Details

```
GET /contract/:contract_id
Authorization: Bearer <token>
```

### Resolve a Conditional Contract

```
POST /contract/:contract_id/resolve
Authorization: Bearer <token>
```

Triggers condition evaluation using external data (CoinGecko, news APIs) inside the TEE.

### Service Affirmation (Receiver Side)

```http
POST /contract/:contract_id/affirm
Authorization: Bearer <token>
```

### Escrow Endpoints

```http
POST /contract/:contract_id/escrow/prepare
Authorization: Bearer <token>
```

Returns escrow details plus tx payload (`to`, `value_wei`, `data`) for payer funding.

For service deals, default payer is the service receiver if no explicit payer field is set.
Settlement routing is:
- TRUE / receiver affirmation -> release to provider wallet
- FALSE / timeout -> refund to payer wallet

```http
POST /contract/:contract_id/escrow/funded
Authorization: Bearer <token>
Content-Type: application/json

{ "tx_hash": "0x..." }
```

```http
GET /contract/:contract_id/escrow
Authorization: Bearer <token>
```

### Check Reputation

```
GET /reputation/:wallet_address
Authorization: Bearer <token>
```

### Verify Attestation

```
GET /attestation/:attestation_id
```

Primary verification fields to inspect:

- `data_hash`, `hash_algo`
- `signature`, `sig_type`, `signer_wallet`
- `sig_domain`, `sig_types`, `sig_message`
- `payload`, `created_at`

Compatibility endpoint still exists:

```
GET /attestation/:attestation_id/verify
```

Verify page behavior:
- `/verify` performs browser-local cryptographic checks.
- If a provided attestation link is stale, it can resolve to the latest relevant contract/escrow attestation.

## Negotiation Strategy Tips

1. Start with a reasonable offer - the system tracks good faith
2. Keep structured terms explicit (`price_amount`, `currency`, `timeline`, `deliverables`, `acceptance_criteria`)
3. Both parties must confirm the same `terms_hash` before contract creation
4. Both parties must confirm the same `escrow_amount_eth` in the done call
5. Walking away hurts your reputation (-2 points)
6. Your constraints are private - visible only to your own session side

## Example: Full Agent Negotiation Flow

```
1. POST /auth/challenge -> sign message -> POST /auth/verify -> get bearer token
2. POST /negotiate/create -> get room_id
3. Share room_id with counterparty
4. Counterparty authenticates and POST /negotiate/join
5. Exchange structured offers via POST /negotiate/offer
6. Party 1 POST /negotiate/done -> receives `awaiting_other_party_confirmation` + `terms_hash`
7. Party 2 POST /negotiate/done with matching `terms_hash` and same `escrow_amount_eth` -> receives `deal` + contract
8. Payer POST /contract/:id/escrow/prepare and send onchain funding tx
9. Payer POST /contract/:id/escrow/funded with tx hash
10. For service: receiver POST /contract/:id/affirm. For conditional: POST /contract/:id/resolve
11. GET /attestation/:id and verify signer/hash metadata (optionally check /verify compatibility endpoint)
```
