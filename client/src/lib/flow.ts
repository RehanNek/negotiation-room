export type WizardStep = 'identity' | 'path' | 'setup' | 'live';
export type NegotiationPath = 'create_custom' | 'join_existing';

export function resolveInitialStep(hasWallet: boolean): WizardStep {
  return hasWallet ? 'path' : 'identity';
}

export function resolveStepAfterPath(path: NegotiationPath): WizardStep {
  switch (path) {
    case 'create_custom':
    case 'join_existing':
      return 'setup';
  }
}

export function canAdvanceFromSetup(path: NegotiationPath, hasRequiredInputs: boolean): boolean {
  switch (path) {
    case 'create_custom':
    case 'join_existing':
      return hasRequiredInputs;
  }
}

export function parseContractFocus(search: URLSearchParams): { focus: string | null; from: string | null } {
  const focus = search.get('focus');
  const from = search.get('from');
  return {
    focus: focus && focus.trim() ? focus : null,
    from: from && from.trim() ? from : null,
  };
}
