import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetchBlob, proxyR2Url } from '../api/client';

describe('api client', () => {
  beforeEach(() => {
    localStorage.setItem('adminKey', 'test-key');
  });

  it('proxyR2Url encodes key', () => {
    const url = proxyR2Url('daily-close/2026-01-13/report.html');
    expect(url).toContain('key=daily-close%2F2026-01-13%2Freport.html');
  });

  it('apiFetchBlob sends x-admin-key', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        blob: async () => new Blob(['ok'])
      } as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiFetchBlob('/r2?key=test');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/r2?key=test'),
      expect.objectContaining({ headers: { 'x-admin-key': 'test-key' } })
    );
  });
});
