import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.ADMIN_API_KEY || '';
  const apiBase = import.meta.env.PUBLIC_API_BASE || 'http://localhost:8787';
  const url = new URL(request.url);
  const queryString = url.search;
  const targetUrl = `${apiBase}/r2${queryString}`;

  const headers = new Headers();
  headers.set('x-admin-key', apiKey);

  const response = await fetch(targetUrl, { headers });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};
