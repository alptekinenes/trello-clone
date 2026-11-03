import { act, screen } from '@testing-library/react';
import { REALTIME_UNAUTHORIZED } from '@trello/contracts';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardDetail } from '../../../test/fixtures';
import { fakeRealtime } from '../../../test/fake-realtime';
import { renderWithProviders } from '../../../test/render';
import { RECONNECT_GRACE_MS } from '../../../shared/hooks/use-realtime-indicator';
import { realtime } from '../../../shared/lib/realtime-client';
import { BoardHeader } from './board-header';

function renderHeader() {
  return renderWithProviders(
    <MemoryRouter>
      <BoardHeader detail={boardDetail('OWNER')} />
    </MemoryRouter>,
  );
}

/** Other parts of the page have status regions too; pick the one that holds the connection text. */
const statusRegions = () => screen.getAllByRole('status');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BoardHeader connection indicator', () => {
  it('keeps a quiet, empty status region while the connection is fine', () => {
    renderHeader();
    realtime.start();
    fakeRealtime.connect();

    expect(statusRegions().some((region) => region.matches(':empty'))).toBe(true);
    expect(screen.queryByText(/Bağlantı koptu/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yeniden bağlan' })).not.toBeInTheDocument();
  });

  it('announces a long reconnect inside the header', () => {
    renderHeader();
    realtime.start();
    fakeRealtime.connect();

    fakeRealtime.drop('transport close');
    act(() => {
      vi.advanceTimersByTime(RECONNECT_GRACE_MS);
    });

    const region = statusRegions().find((candidate) =>
      candidate.textContent?.includes('Bağlantı koptu. Yeniden bağlanılıyor…'),
    );
    expect(region).toBeDefined();
    expect(screen.getByRole('banner')).toContainElement(region as HTMLElement);
  });

  it('offers a retry button when live updates are off', async () => {
    renderHeader();
    realtime.start();
    fakeRealtime.connect();

    fakeRealtime.rejectHandshake(REALTIME_UNAUTHORIZED);
    await act(async () => {});

    expect(screen.getAllByText('Canlı güncellemeler kapalı.')).toHaveLength(2);
    const retry = screen.getByRole('button', { name: 'Yeniden bağlan' });
    expect(screen.getByRole('banner')).toContainElement(retry);
    // The header's own controls are still there.
    expect(screen.getByRole('button', { name: 'Üyeler' })).toBeInTheDocument();
  });
});
