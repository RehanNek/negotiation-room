import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CompatibleWith from '@/components/CompatibleWith';

describe('CompatibleWith', () => {
  it('renders all three agent badges', () => {
    render(<CompatibleWith />);
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('OpenClaw')).toBeInTheDocument();
  });

  it('renders the "+ more" label', () => {
    render(<CompatibleWith />);
    expect(screen.getByText('+ more')).toBeInTheDocument();
  });

  it('renders the "COMPATIBLE WITH" label', () => {
    render(<CompatibleWith />);
    expect(screen.getByText('Compatible With')).toBeInTheDocument();
  });
});
