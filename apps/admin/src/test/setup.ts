import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  }
};

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  writable: true
});

globalThis.fetch = vi.fn(async () => {
  return {
    ok: true,
    json: async () => ({ ok: true, report: null, documents: [] }),
    text: async () => ''
  } as Response;
});
