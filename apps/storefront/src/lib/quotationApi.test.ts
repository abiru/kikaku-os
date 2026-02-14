import { describe, expect, it, vi } from 'vitest';
import {
  acceptQuotation,
  createQuotation,
  fetchQuotation,
  fetchQuotationHtml,
  type CreateQuotationInput,
} from './quotationApi';

const apiBase = 'https://api.example.com';
const token = 'PublicTokenExample1234';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('quotation api helpers', () => {
  it('runs create -> fetch -> accept flow with public token', async () => {
    const payload: CreateQuotationInput = {
      customerCompany: 'Acme Inc.',
      customerName: 'Taro',
      customerEmail: 'taro@example.com',
      customerPhone: '03-0000-0000',
      notes: 'Need lead time',
      items: [{ variantId: 1, quantity: 2 }],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: 10, publicToken: token }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          quotation: { public_token: token, quotation_number: 'EST-0010' },
          items: [],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, checkoutUrl: 'https://stripe.example/checkout' }));

    const created = await createQuotation(apiBase, payload, fetchMock as unknown as typeof fetch);
    expect(created.publicToken).toBe(token);

    const detail = await fetchQuotation(apiBase, token, fetchMock as unknown as typeof fetch);
    expect(detail.quotation).toBeTruthy();

    const accepted = await acceptQuotation(apiBase, token, fetchMock as unknown as typeof fetch);
    expect(accepted.checkoutUrl).toBe('https://stripe.example/checkout');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/quotations',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.example.com/quotations/${token}`
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `https://api.example.com/quotations/${token}/accept`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects invalid tokens before making requests', async () => {
    const fetchMock = vi.fn();
    await expect(fetchQuotation(apiBase, '12345', fetchMock as unknown as typeof fetch)).rejects.toThrow(
      'Invalid quotation token'
    );
    await expect(acceptQuotation(apiBase, '12345', fetchMock as unknown as typeof fetch)).rejects.toThrow(
      'Invalid quotation token'
    );
    await expect(fetchQuotationHtml(apiBase, '12345', fetchMock as unknown as typeof fetch)).rejects.toThrow(
      'Invalid quotation token'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns HTML for quotation export', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html><body>quotation</body></html>', { status: 200 }));
    const html = await fetchQuotationHtml(apiBase, token, fetchMock as unknown as typeof fetch);
    expect(html).toContain('quotation');
  });
});
