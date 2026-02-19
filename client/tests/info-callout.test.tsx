import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import InfoCallout from '@/components/InfoCallout';

describe('InfoCallout', () => {
  it('preserves tone mappings in dark theme', () => {
    const { rerender } = render(<InfoCallout title="Info" description="Details" tone="info" />);
    const infoTitle = screen.getByText('Info').closest('aside');
    expect(infoTitle?.className).toContain('var(--accent-gold)');

    rerender(<InfoCallout title="Success" description="Done" tone="success" />);
    expect(screen.getByText('Success').closest('aside')?.className).toContain('var(--success)');

    rerender(<InfoCallout title="Warning" description="Heads up" tone="warning" />);
    expect(screen.getByText('Warning').closest('aside')?.className).toContain('var(--warning)');

    rerender(<InfoCallout title="Danger" description="Stop" tone="danger" />);
    expect(screen.getByText('Danger').closest('aside')?.className).toContain('var(--danger)');
  });
});
