import { getToken } from './clerk';
import { getApiBase, fetchJson } from './api';

type AuthFetchOptions = RequestInit & {
  parseJson?: boolean;
};

export const authFetch = async <T = unknown>(
  url: string,
  options: AuthFetchOptions = {}
): Promise<T> => {
  const token = await getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetchJson<T>(url, {
    ...options,
    headers,
  });
};

export const adminFetch = async <T = unknown>(
  path: string,
  options: AuthFetchOptions = {}
): Promise<T> => {
  const base = getApiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalizedPath}`;

  return authFetch<T>(url, options);
};

export const adminGet = async <T = unknown>(path: string): Promise<T> => {
  return adminFetch<T>(path, { method: 'GET' });
};

export const adminPost = async <T = unknown>(
  path: string,
  body: unknown
): Promise<T> => {
  return adminFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

export const adminPut = async <T = unknown>(
  path: string,
  body: unknown
): Promise<T> => {
  return adminFetch<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

export const adminDelete = async <T = unknown>(path: string): Promise<T> => {
  return adminFetch<T>(path, { method: 'DELETE' });
};
