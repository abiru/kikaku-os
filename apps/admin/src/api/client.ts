const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

const getAdminKey = () => localStorage.getItem('adminKey') || '';

type HttpMethod = 'GET' | 'POST';

type FetchOptions = {
  method?: HttpMethod;
  body?: any;
};

export const apiFetch = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': getAdminKey()
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'Request failed');
  }

  return res.json();
};

export const proxyR2Url = (key: string) => `${API_BASE}/r2?key=${encodeURIComponent(key)}`;

export const apiFetchBlob = async (path: string): Promise<Blob> => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'x-admin-key': getAdminKey()
    }
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'Request failed');
  }

  return res.blob();
};
