import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusPill from '@/components/StatusPill';

describe('StatusPill', () => {
  it('renders tone classes and pulse state', () => {
    const { rerender } = render(<StatusPill label="Info" tone="info" pulse />);
    const info = screen.getByText('Info').closest('span');
    expect(info?.className).toContain('var(--accent-gold)');
    expect(info?.querySelector('span')?.className).toContain('animate-pulse');

    rerender(<StatusPill label="Success" tone="success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();

    rerender(<StatusPill label="Warning" tone="warning" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();

    rerender(<StatusPill label="Danger" tone="danger" />);
    expect(screen.getByText('Danger')).toBeInTheDocument();
  });
});
