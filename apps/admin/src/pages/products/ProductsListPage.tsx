import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { apiFetch } from '../../api/client';

type Product = {
  id: number;
  title: string;
  description: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

type ProductsResponse = {
  ok: boolean;
  data: Product[];
  total: number;
  page: number;
  perPage: number;
};

const PER_PAGE = 20;

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildQuery = (q: string, page: number) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('perPage', String(PER_PAGE));
  return params.toString();
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const ProductsListPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get('q')?.trim() ?? '';
  const pageParam = parsePositiveInt(searchParams.get('page'), 1);

  const [query, setQuery] = useState(qParam);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(qParam);
  }, [qParam]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(qParam, pageParam);
      const data = await apiFetch<ProductsResponse>(`/admin/products?${qs}`);
      setItems(data.data || []);
      setTotal(data.total || 0);
      setPerPage(data.perPage || PER_PAGE);
    } catch (err: any) {
      setItems([]);
      setTotal(0);
      setError(err.message || 'failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [qParam, pageParam]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (query) next.set('q', query);
    else next.delete('q');
    next.set('page', '1');
    setSearchParams(next);
  };

  const clearSearch = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.set('page', '1');
    setSearchParams(next);
  };

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  };

  const totalPages = useMemo(() => {
    if (total === 0) return 1;
    return Math.ceil(total / perPage);
  }, [total, perPage]);

  const rangeText = useMemo(() => {
    if (total === 0) return 'No products';
    const start = (pageParam - 1) * perPage + 1;
    const end = Math.min(total, pageParam * perPage);
    return `Showing ${start}-${end} of ${total}`;
  }, [total, pageParam, perPage]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-zinc-500">Search and browse products</p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          Reload
        </button>
      </div>

      <div className="card space-y-4">
        <form className="flex flex-col md:flex-row md:items-center gap-3" onSubmit={submitSearch}>
          <input
            type="search"
            placeholder="Search by title or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full md:flex-1 rounded-xl border border-zinc-200 px-3 py-2 bg-white"
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Search
            </button>
            {qParam && (
              <button type="button" className="btn btn-ghost" onClick={clearSearch}>
                Clear
              </button>
            )}
          </div>
        </form>

        {error && <div className="text-red-600 text-sm">{error}</div>}
        {loading && <div className="text-sm text-zinc-500">loading...</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id} className="border-b border-zinc-100">
                  <td className="py-3 pr-4 text-zinc-700">{product.id}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-zinc-900">{product.title}</div>
                    {product.description && (
                      <div className="text-xs text-zinc-500">{product.description}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">{formatDate(product.created_at)}</td>
                  <td className="py-3 text-zinc-600">{formatDate(product.updated_at)}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    No products found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-zinc-600">
          <div>{rangeText}</div>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => goToPage(pageParam - 1)}
              disabled={pageParam <= 1}
            >
              Prev
            </button>
            <div>
              Page {pageParam} of {totalPages}
            </div>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => goToPage(pageParam + 1)}
              disabled={pageParam >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductsListPage;
