import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfferTermsView from '@/components/OfferTermsView';
import { describe, expect, it } from 'vitest';

describe('OfferTermsView', () => {
  it('shows humanized terms by default and toggles raw view', async () => {
    const user = userEvent.setup();

    render(
      <OfferTermsView
        terms={{
          max_price: 500,
          preferred_token: 'ETH',
        }}
      />,
    );

    expect(screen.getByText('Max Price')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Preferred Token')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByRole('button', { name: 'Simple View' })).toBeInTheDocument();
    expect(screen.getByText(/"max_price": 500/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simple View' }));
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByText('Max Price')).toBeInTheDocument();
  });

  it('parses JSON string terms and renders fallback text for unstructured values', () => {
    const { rerender } = render(<OfferTermsView terms='{"counterparty":"agent-1","amount":42}' />);
    expect(screen.getByText('Counterparty')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();

    rerender(<OfferTermsView terms="simple text payload" />);
    expect(screen.getByText('simple text payload')).toBeInTheDocument();
  });
});
