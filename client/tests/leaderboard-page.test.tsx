import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeaderboardPage from '@/app/leaderboard/page';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getLeaderboard: vi.fn(),
  },
}));

const { api } = await import('@/lib/api');
const mockGetLeaderboard = vi.mocked(api.getLeaderboard);

const SAMPLE_ENTRIES = [
  { wallet_address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', total_reputation: 90, deals_completed: 9, total_negotiations: 10, conditional_deals: 2, avg_rounds: 3, good_faith_score: 95, last_updated: '2026-01-01T00:00:00Z' },
  { wallet_address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', total_reputation: 60, deals_completed: 6, total_negotiations: 7, conditional_deals: 1, avg_rounds: 4, good_faith_score: 80, last_updated: '2026-01-01T00:00:00Z' },
  { wallet_address: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', total_reputation: 30, deals_completed: 3, total_negotiations: 4, conditional_deals: 0, avg_rounds: 5, good_faith_score: 65, last_updated: '2026-01-01T00:00:00Z' },
];

describe('LeaderboardPage', () => {
  beforeEach(() => {
    mockGetLeaderboard.mockReset();
  });

  it('shows skeleton rows while loading', () => {
    mockGetLeaderboard.mockReturnValue(new Promise(() => {})); // never resolves
    render(<LeaderboardPage />);
    // Skeleton rows are animate-pulse divs; verify the page title is visible
    expect(screen.getByText('Top Deal Makers')).toBeInTheDocument();
    // At least one skeleton div should be present
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders participant rows with medals for top 3', async () => {
    mockGetLeaderboard.mockResolvedValue(SAMPLE_ENTRIES);
    render(<LeaderboardPage />);

    await waitFor(() => {
      expect(screen.getByText('🥇')).toBeInTheDocument();
      expect(screen.getByText('🥈')).toBeInTheDocument();
      expect(screen.getByText('🥉')).toBeInTheDocument();
    });
  });

  it('renders truncated wallet addresses', async () => {
    mockGetLeaderboard.mockResolvedValue(SAMPLE_ENTRIES);
    render(<LeaderboardPage />);

    await waitFor(() => {
      // formatWallet truncates to 6+4 chars: 0xAAAA...AAAA
      expect(screen.getByText('0xAAAA...AAAA')).toBeInTheDocument();
    });
  });

  it('renders star ratings', async () => {
    mockGetLeaderboard.mockResolvedValue(SAMPLE_ENTRIES);
    render(<LeaderboardPage />);

    await waitFor(() => {
      // score=90 → ceil(90/20)=5 → ★★★★★
      expect(screen.getByText('★★★★★')).toBeInTheDocument();
      // score=60 → ceil(60/20)=3 → ★★★☆☆
      expect(screen.getByText('★★★☆☆')).toBeInTheDocument();
    });
  });

  it('renders deal counts', async () => {
    mockGetLeaderboard.mockResolvedValue(SAMPLE_ENTRIES);
    render(<LeaderboardPage />);

    await waitFor(() => {
      expect(screen.getByText('9')).toBeInTheDocument();
      expect(screen.getByText('6')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('shows EmptyState when the list is empty', async () => {
    mockGetLeaderboard.mockResolvedValue([]);
    render(<LeaderboardPage />);

    await waitFor(() => {
      expect(screen.getByText('No participants yet')).toBeInTheDocument();
    });
  });

  it('shows an error callout when the API fails', async () => {
    mockGetLeaderboard.mockRejectedValue(new Error('Service unavailable'));
    render(<LeaderboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Could not load leaderboard')).toBeInTheDocument();
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('renders the CTA to enter a deal room', async () => {
    mockGetLeaderboard.mockResolvedValue(SAMPLE_ENTRIES);
    render(<LeaderboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Enter Deal Room' })).toBeInTheDocument();
    });
  });
});
