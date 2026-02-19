import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MissionHeader from '@/components/MissionHeader';

let currentPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

vi.mock('@/lib/api', () => ({
  api: {
    me: vi.fn(),
  },
}));

describe('MissionHeader', () => {
  beforeEach(() => {
    currentPathname = '/';
    localStorage.clear();
  });

  it('renders wordmark-only lockup and highlights active nav with gold rule', async () => {
    currentPathname = '/verify';

    render(<MissionHeader />);

    expect(screen.getByRole('link', { name: 'Negotiation Room' })).toBeInTheDocument();
    expect(screen.getByText('Private. Verifiable. No middleman.')).toBeInTheDocument();

    const verifyLink = screen.getByRole('link', { name: 'Verify' });
    expect(verifyLink.className).toContain('shadow-[inset_0_-1px_0_0_var(--accent-gold)]');
    expect(screen.queryByText('No active session')).toBeInTheDocument();
  });
});
