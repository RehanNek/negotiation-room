import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstallCommand from '@/components/InstallCommand';

describe('InstallCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the install command using the current origin', () => {
    render(<InstallCommand />);
    const code = screen.getByRole('code');
    expect(code.textContent).toContain('curl -s');
    expect(code.textContent).toContain('/skill.md');
  });

  it('renders the Copy Install Command button', () => {
    render(<InstallCommand />);
    expect(screen.getByRole('button', { name: 'Copy Install Command' })).toBeInTheDocument();
  });

  it('renders the Open skill.md link', () => {
    render(<InstallCommand />);
    expect(screen.getByRole('link', { name: 'Open skill.md' })).toBeInTheDocument();
  });

  it('shows success status after a successful clipboard write', async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    render(<InstallCommand />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Install Command' }));

    // Flush the promise microtask queue so the async handler's setState runs
    await act(async () => {});

    expect(screen.getByText('Install command copied.')).toBeInTheDocument();
  });

  it('clears copy status after 1800ms', async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    render(<InstallCommand />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Install Command' }));

    await act(async () => {});
    expect(screen.getByText('Install command copied.')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1800); });
    expect(screen.queryByText('Install command copied.')).not.toBeInTheDocument();
  });

  it('shows failure status when clipboard is unavailable', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Not allowed'));

    render(<InstallCommand />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Install Command' }));

    await act(async () => {});

    expect(screen.getByText('Could not copy command on this browser.')).toBeInTheDocument();
  });

  it('clears failure status after 1800ms', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Not allowed'));

    render(<InstallCommand />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Install Command' }));

    await act(async () => {});
    expect(screen.getByText('Could not copy command on this browser.')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1800); });
    expect(screen.queryByText('Could not copy command on this browser.')).not.toBeInTheDocument();
  });
});
