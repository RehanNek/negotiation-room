# Negotiation Room (The Room) - Product Requirements Document

## Overview
The Room is a verifiable negotiation infrastructure running on EigenCloud where agents and humans make private deals - including conditional contracts that auto-resolve - with provable fairness via TEE attestation.

## Goals
1. Enable private, fair negotiations between any two parties (human-human, human-agent, agent-agent)
2. Support both service deals and conditional contracts
3. Provide verifiable fairness through TEE attestation
4. Build reputation scores based on negotiation behavior
5. Expose an OpenClaw skill so AI agents can negotiate programmatically
6. Optionally settle deals via onchain escrow on Sepolia (ETH) without a middleman
7. Ensure attestation validity is independently checkable without trusting backend verification endpoints

## User Personas

### Human Negotiators (via Website)
- Connect via MetaMask wallet
- Type offers in plain English (AI parses to structured terms)
- Use a chat-style negotiation workspace
- Check contract status and reputation

### AI Agents (via OpenClaw Skill / API)
- Submit structured JSON offers directly
- Create and join negotiation rooms programmatically
- Check reputation and contract status via API

## Functional Requirements

### Negotiation Protocol
- Party A creates a room with category, parameters, and required private constraints.
- Party B joins with a shared room code and their own required private constraints.
- Parties exchange chat messages/offers (no fixed round limit in the user experience).
- Closing is explicit and requires dual confirmation:
  - First party confirms "Done" and receives `terms_draft` + `terms_hash`.
  - Second party confirms "Done" with the same `terms_hash`.
  - Contract is created only when both match.
- Any new offer clears pending "Done" confirmations and requires re-confirmation.
- Outcomes:
  - `waiting` (created, awaiting counterparty)
  - `active` (both parties present, negotiating)
  - `deal` (contract created)
  - `no_deal` (walkaway)

### Deal Types
1. **Service Deals**: Standard negotiation producing a structured contract
2. **Conditional Deals**: Contract with conditions that auto-resolve based on external data (crypto prices, events)

### Contract Engine
- Stores structured contract terms
- For conditional deals: fetches external data (CoinGecko, news APIs) from inside TEE
- EigenAI evaluates conditions with step-by-step reasoning
- Produces a verdict (TRUE / FALSE / PENDING) and records an integrity proof

### Reputation System
- Per-wallet scoring based on negotiation behavior
- Signals: deals reached, good faith offers, quick resolution, walkaway, lowballing, clean resolution, disputed verdicts
- Reputation visible to other parties and factored into AI suggestions

### Onchain Escrow (Optional, Sepolia ETH)
- When escrow is enabled (env-config), contracts can be funded with real ETH on Sepolia.
- Payer flow:
  - `POST /contract/:id/escrow/prepare` returns tx params for `fundDeal(...)`.
  - Payer sends the funding transaction via wallet (MetaMask).
  - `POST /contract/:id/escrow/funded` verifies onchain logs and marks escrow as funded.
- Service role default:
  - Service receiver is the default payer when explicit payer fields are absent.
  - On `TRUE`/service affirmation, escrow releases to service provider.
  - On `FALSE`/timeout, escrow refunds the payer.
- Settlement:
  - Service contracts: receiver affirms delivery (`POST /contract/:id/affirm`) which triggers onchain settlement when escrow is funded.
  - Conditional contracts: `POST /contract/:id/resolve` triggers condition evaluation and settlement when escrow is funded.
- Timeout:
  - Funded but unresolved escrows can be refunded after timeout.
  - A scheduler retries settlement/refund attempts when enabled.

### TEE Attestation
- Negotiation, contract generation, and resolution logic run inside EigenCompute TEE.
- Integrity proofs are generated for key state transitions (deal recorded, resolution, escrow actions).
- Proofs are inspectable via the attestation endpoints and the Verify UI.

### Trust Model (vNext, Implemented)
- Attestations use canonicalized payload hashing (`sha256-rfc8785`) and EIP-712 signatures.
- `GET /attestation/:id` is the source of truth for verification material:
  - hash, signature, signer address, typed-data domain/types/message.
- Browser Verify performs local cryptographic verification and does not trust `/attestation/:id/verify` as final authority.
- `/attestation/:id/verify` remains compatibility-only for legacy consumers.
- Backend release provenance is expected to come from verifiable source builds (`--verifiable`).

## API Specification
See server/src/routes/ for full endpoint implementations.

## Non-Functional Requirements
- Privacy: Private constraints never exposed to other party
- Verifiability: TEE attestation on all contract resolutions, plus independently verifiable signatures
- Performance: Polling-based real-time updates (simplicity over WebSockets), including contract/escrow status refresh for both parties
- Security: Wallet-based identity, no passwords
- Supply-chain integrity: production backend releases should carry source/provenance metadata

## Out of Scope
- Full per-event remote-attestation quote verification in the Verify UI
- Matchmaking / room discovery
- Multi-party negotiations (2 parties only)
- Automated dispute resolution beyond AI verdict
