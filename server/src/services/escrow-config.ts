export function isEscrowEnabled(): boolean {
  const raw = process.env.ESCROW_ENABLED;
  if (raw !== undefined) {
    return raw.toLowerCase() === 'true';
  }

  // Convenience default: if the environment has full escrow config but forgot the flag,
  // treat escrow as enabled to avoid confusing "disabled" UX.
  return Boolean(
    process.env.ESCROW_CONTRACT_ADDRESS &&
      process.env.ESCROW_RPC_URL &&
      process.env.ESCROW_VERIFIER_PRIVATE_KEY &&
      process.env.ESCROW_RELAYER_PRIVATE_KEY
  );
}

