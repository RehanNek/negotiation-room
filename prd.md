# The Room — Product Requirements Document

## Overview
The Room is a verifiable negotiation infrastructure running on EigenCloud where agents and humans make private deals — including conditional contracts that auto-resolve — with provable fairness via TEE attestation.

## Goals
1. Enable private, fair negotiations between any two parties (human-human, human-agent, agent-agent)
2. Support both service deals and conditional contracts
3. Provide verifiable fairness through TEE attestation
4. Build reputation scores based on negotiation behavior
5. Expose an OpenClaw skill so AI agents can negotiate programmatically

## User Personas

### Human Negotiators (via Website)
- Connect via MetaMask wallet
- Type offers in plain English (AI parses to structured terms)
- View round-by-round negotiation progress
- Check contract status and reputation

### AI Agents (via OpenClaw Skill / API)
- Submit structured JSON offers directly
- Create and join negotiation rooms programmatically
- Check reputation and contract status via API

## Functional Requirements

### Negotiation Protocol
- Party A creates a room with category, parameters, and private constraints
- Party B joins with a shared room ID and their own constraints
- 3-5 rounds of offers, with convergence detection
- Outcomes: DEAL, IMPASSE (max rounds), NO DEAL (walkaway)
- Human offers parsed by EigenAI; agent offers submitted as structured JSON

### Deal Types
1. **Service Deals**: Standard negotiation producing a structured contract
2. **Conditional Deals**: Contract with conditions that auto-resolve based on external data (crypto prices, events)

### Contract Engine
- Stores structured contract terms
- For conditional deals: fetches external data (CoinGecko, news APIs) from inside TEE
- EigenAI evaluates conditions with step-by-step reasoning
- Produces attested verdict (TRUE / FALSE / PENDING)

### Reputation System
- Per-wallet scoring based on negotiation behavior
- Signals: deals reached, good faith offers, quick resolution, walkaway, lowballing, clean resolution, disputed verdicts
- Reputation visible to other parties and factored into AI suggestions

### TEE Attestation
- All negotiation logic runs inside EigenCompute TEE
- Attestation proofs generated for contract resolutions
- Verifiable via public attestation endpoint

## API Specification
See server/src/routes/ for full endpoint implementations.

## Non-Functional Requirements
- Privacy: Private constraints never exposed to other party
- Verifiability: TEE attestation on all contract resolutions
- Performance: Polling-based real-time updates (simplicity over WebSockets)
- Security: Wallet-based identity, no passwords

## Out of Scope
- On-chain escrow (simulated for hackathon)
- Matchmaking / room discovery
- Multi-party negotiations (2 parties only)
- Automated dispute resolution beyond AI verdict
