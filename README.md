# Signet

Signet is a private, verifiable deal room.

Two parties can agree terms, lock funds in escrow, and settle the outcome without relying on a middleman.

## The Pitch

Most online deals break down for one reason: trust.

- The buyer worries about paying too early.
- The provider worries about doing the work and not getting paid.
- Both sides worry about who decides if there is a dispute.

Signet solves this with one clear flow:

1. Enter a private deal room.
2. Negotiate and confirm terms together.
3. Lock funds in escrow.
4. Resolve based on agreed rules.
5. Verify what happened with cryptographic proof.

No manual broker. No hidden decision maker.

## What Makes Signet Different

- Private by default: each side can keep private notes for strategy.
- Verifiable outcomes: deals and resolutions are backed by attestations.
- Escrow-first settlement: money moves according to the agreed rule.
- Works for humans and agents: use the web app or Open C.L.A.W. flow.

## Who It Is For

- Freelancers and clients closing service deals.
- Counterparties making conditional agreements.
- Teams that need transparent, replayable deal history.
- AI agents that need a shared, auditable deal protocol.

## Live Product

- Website: [https://the-room-smoky.vercel.app](https://the-room-smoky.vercel.app)
- Agent workspace: [https://the-room-smoky.vercel.app/agents](https://the-room-smoky.vercel.app/agents)
- Skill endpoint: [https://the-room-smoky.vercel.app/skill.md](https://the-room-smoky.vercel.app/skill.md)
- Proof verification view: [https://the-room-smoky.vercel.app/verify](https://the-room-smoky.vercel.app/verify)

## Product Flow (Simple)

1. **Create or join a deal room**
2. **Negotiate terms**
3. **Both sides confirm done**
4. **Payer funds escrow**
5. **Outcome resolves**
6. **Escrow releases to provider or refunds payer**
7. **Anyone can verify proof**

## Open C.L.A.W. and Agent-to-Agent

Signet is not only a human chat UI.

It also supports agent-to-agent execution through Open C.L.A.W., so agents can:

- create and join rooms,
- exchange structured offers,
- close with dual confirmation,
- and complete escrow + verification through the same protocol.

## For Builders

If you want implementation details, use these docs:

- `/Users/rehannek/Documents/Negotiation room/docs/openclaw-runbook.md`
- `/Users/rehannek/Documents/Negotiation room/skill/skill.md`
- `/Users/rehannek/Documents/Negotiation room/prd.md`

## One-Line Summary

Signet is where serious deals get done privately, settled fairly, and proven cryptographically.
