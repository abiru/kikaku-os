import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import InboxPage from '../pages/automation/InboxPage';

const lastUrl = (fetchMock: ReturnType<typeof vi.fn>) => {
  const lastCall = fetchMock.mock.calls.at(-1);
  return new URL(String(lastCall?.[0]), 'http://localhost');
};

describe('Inbox views', () => {
  const renderInbox = (initialEntry = '/inbox') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('defaults to All Open and fetches open items', async () => {
    localStorage.setItem('adminKey', 'test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [] }),
      text: async () => ''
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderInbox('/inbox');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = lastUrl(fetchMock);
    expect(url.pathname).toBe('/inbox');
    expect(url.searchParams.get('status')).toBe('open');
  });

  it('switches to Daily Close view and applies kind filter', async () => {
    localStorage.setItem('adminKey', 'test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [] }),
      text: async () => ''
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderInbox('/inbox');

    const dailyClose = await screen.findByText('Daily Close');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const before = fetchMock.mock.calls.length;
    fireEvent.click(dailyClose);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    const url = lastUrl(fetchMock);
    expect(url.searchParams.get('status')).toBe('open');
    expect(url.searchParams.get('kind')).toBe('daily_close_anomaly');
  });

  it('adds date filter and preserves view filters (kind)', async () => {
    localStorage.setItem('adminKey', 'test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [] }),
      text: async () => ''
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderInbox('/inbox?inboxView=daily_close');

    const dateInput = await screen.findByDisplayValue('');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const before = fetchMock.mock.calls.length;
    fireEvent.change(dateInput, { target: { value: '2026-01-15' } });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    const url = lastUrl(fetchMock);
    expect(url.searchParams.get('inboxView')).toBeNull();
    expect(url.searchParams.get('kind')).toBe('daily_close_anomaly');
    expect(url.searchParams.get('date')).toBe('2026-01-15');
  });

  it('clears date filter from query', async () => {
    localStorage.setItem('adminKey', 'test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [] }),
      text: async () => ''
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderInbox('/inbox?inboxView=daily_close&date=2026-01-15');

    const clearButton = await screen.findByText('Clear');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const before = fetchMock.mock.calls.length;
    fireEvent.click(clearButton);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    const url = lastUrl(fetchMock);
    expect(url.searchParams.get('date')).toBeNull();
    expect(url.searchParams.get('kind')).toBe('daily_close_anomaly');
  });
});
