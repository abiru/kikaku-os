import { isPublicToken } from './publicToken';

type FetchLike = typeof fetch;

type JsonResponse = {
  ok?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type QuotationItemInput = {
  variantId: number;
  quantity: number;
};

export type CreateQuotationInput = {
  customerCompany: FormDataEntryValue | null;
  customerName: FormDataEntryValue | null;
  customerEmail: FormDataEntryValue | null;
  customerPhone: FormDataEntryValue | null;
  notes: FormDataEntryValue | null;
  items: QuotationItemInput[];
};

const normalizeBase = (apiBase: string): string => apiBase.replace(/\/+$/, '');

const assertOkJson = async (response: Response): Promise<JsonResponse> => {
  const json = (await response.json()) as JsonResponse;
  if (!response.ok || json.ok === false) {
    throw new Error(json.message || 'Request failed');
  }
  return json;
};

export const createQuotation = async (
  apiBase: string,
  payload: CreateQuotationInput,
  fetchImpl: FetchLike = fetch
): Promise<JsonResponse> => {
  const response = await fetchImpl(`${normalizeBase(apiBase)}/quotations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return assertOkJson(response);
};

export const fetchQuotation = async (
  apiBase: string,
  quotationToken: string,
  fetchImpl: FetchLike = fetch
): Promise<JsonResponse> => {
  if (!isPublicToken(quotationToken)) {
    throw new Error('Invalid quotation token');
  }

  const response = await fetchImpl(
    `${normalizeBase(apiBase)}/quotations/${encodeURIComponent(quotationToken)}`
  );

  return assertOkJson(response);
};

export const acceptQuotation = async (
  apiBase: string,
  quotationToken: string,
  fetchImpl: FetchLike = fetch
): Promise<JsonResponse> => {
  if (!isPublicToken(quotationToken)) {
    throw new Error('Invalid quotation token');
  }

  const response = await fetchImpl(
    `${normalizeBase(apiBase)}/quotations/${encodeURIComponent(quotationToken)}/accept`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  );

  return assertOkJson(response);
};

export const fetchQuotationHtml = async (
  apiBase: string,
  quotationToken: string,
  fetchImpl: FetchLike = fetch
): Promise<string> => {
  if (!isPublicToken(quotationToken)) {
    throw new Error('Invalid quotation token');
  }

  const response = await fetchImpl(
    `${normalizeBase(apiBase)}/quotations/${encodeURIComponent(quotationToken)}/html`
  );

  if (!response.ok) {
    throw new Error('HTMLの取得に失敗しました');
  }

  return response.text();
};
