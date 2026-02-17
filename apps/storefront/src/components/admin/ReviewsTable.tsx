import { useState, useEffect, useMemo } from 'react';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { Badge } from '../catalyst/badge';
import { Button } from '../catalyst/button';
import { Select } from '../catalyst/select';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Link } from '../catalyst/link';
import { StarRatingDisplay } from '../StarRating';
import TableSkeleton from './TableSkeleton';
import { useTranslation } from '../../i18n';
import { formatDate } from '../../lib/format';

type Review = {
  id: number;
  product_id: number;
  product_title: string | null;
  customer_email: string;
  customer_name: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

import { getReviewBadgeColor, getReviewStatusLabel } from '../../lib/adminUtils';

export default function ReviewsTable({ apiBase }: { apiBase: string }) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('');
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActioning, setBulkActioning] = useState(false);

  const fetchReviews = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: '50' });
      const res = await fetch(`${apiBase}/admin/reviews?${params}`);
      const data = await res.json() as { ok: boolean; reviews: Review[]; total: number; message?: string };
      if (!data.ok) throw new Error(data.message || 'Failed to load reviews');
      setReviews(data.reviews || []);
      setTotal(data.total || 0);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [statusFilter]);

  const filteredReviews = useMemo(() => {
    if (!productFilter) return reviews;
    const lower = productFilter.toLowerCase();
    return reviews.filter((r) =>
      (r.product_title || '').toLowerCase().includes(lower)
    );
  }, [reviews, productFilter]);

  const productNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of reviews) {
      if (r.product_title) names.add(r.product_title);
    }
    return Array.from(names).sort();
  }, [reviews]);

  const handleAction = async (reviewId: number, action: 'approve' | 'reject') => {
    setActioningId(reviewId);
    try {
      const res = await fetch(`${apiBase}/admin/reviews/${reviewId}/${action}`, {
        method: 'POST',
      });
      const data = await res.json() as { ok: boolean; message?: string };
      if (!data.ok) throw new Error(data.message || `Failed to ${action} review`);
      await fetchReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} review`);
    } finally {
      setActioningId(null);
    }
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return;
    setBulkActioning(true);
    setError('');
    try {
      const promises = Array.from(selectedIds).map(async (id) => {
        const res = await fetch(`${apiBase}/admin/reviews/${id}/${action}`, {
          method: 'POST',
        });
        return res.json() as Promise<{ ok: boolean; message?: string }>;
      });
      await Promise.all(promises);
      await fetchReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to bulk ${action}`);
    } finally {
      setBulkActioning(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredReviews.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReviews.map((r) => r.id)));
    }
  };

  const pendingSelected = filteredReviews.filter(
    (r) => selectedIds.has(r.id) && r.status === 'pending'
  );

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">{t('reviews.adminTitle')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} {t('admin.items')}</p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-3 items-end flex-wrap">
          <Field>
            <Label className="sr-only">{t('admin.filterByProduct')}</Label>
            <Select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            >
              <option value="">{t('reviews.product')}: {t('common.all')}</option>
              {productNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label className="sr-only">{t('reviews.status')}</Label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">{t('reviews.all')}</option>
              <option value="pending">{t('reviews.pendingReview')}</option>
              <option value="approved">{t('reviews.approved')}</option>
              <option value="rejected">{t('reviews.rejected')}</option>
            </Select>
          </Field>
          <Button plain onClick={fetchReviews} disabled={loading}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-indigo-800">
            {t('admin.selectedCount', { count: selectedIds.size })}
          </span>
          {pendingSelected.length > 0 && (
            <>
              <Button
                plain
                onClick={() => handleBulkAction('approve')}
                disabled={bulkActioning}
                className="text-green-600 hover:text-green-800 text-sm"
              >
                {t('admin.bulkApprove')}
              </Button>
              <Button
                plain
                onClick={() => handleBulkAction('reject')}
                disabled={bulkActioning}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                {t('admin.bulkReject')}
              </Button>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <TableSkeleton columns={7} rows={3} />
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-12 h-12 text-zinc-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          <p className="mt-4 text-sm font-medium text-zinc-600">{t('reviews.noReviewsAdmin')}</p>
        </div>
      ) : (
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredReviews.length && filteredReviews.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-300"
                />
              </TableHeader>
              <TableHeader>{t('reviews.product')}</TableHeader>
              <TableHeader>{t('reviews.reviewer')}</TableHeader>
              <TableHeader>{t('reviews.rating')}</TableHeader>
              <TableHeader>{t('reviews.reviewTitle')}</TableHeader>
              <TableHeader>{t('reviews.status')}</TableHeader>
              <TableHeader>{t('reviews.date')}</TableHeader>
              <TableHeader>{t('reviews.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredReviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(review.id)}
                    onChange={() => toggleSelect(review.id)}
                    className="rounded border-zinc-300"
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/admin/products/${review.product_id}`} className="text-indigo-600 hover:text-indigo-800">
                    {review.product_title || `#${review.product_id}`}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-zinc-950">{review.customer_name}</div>
                  <div className="text-zinc-500 text-xs">{review.customer_email}</div>
                </TableCell>
                <TableCell>
                  <StarRatingDisplay rating={review.rating} size="sm" />
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="font-medium text-zinc-950 truncate">{review.title}</div>
                  <div className="text-zinc-500 text-xs truncate mt-0.5">{review.body}</div>
                </TableCell>
                <TableCell>
                  <Badge color={getReviewBadgeColor(review.status)}>
                    {getReviewStatusLabel(review.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 whitespace-nowrap tabular-nums">
                  {formatDate(review.created_at, 'DATE_MONTH_SHORT')}
                </TableCell>
                <TableCell>
                  {review.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        plain
                        onClick={() => handleAction(review.id, 'approve')}
                        disabled={actioningId === review.id}
                        className="text-green-600 hover:text-green-800"
                      >
                        {t('reviews.approve')}
                      </Button>
                      <Button
                        plain
                        onClick={() => handleAction(review.id, 'reject')}
                        disabled={actioningId === review.id}
                        className="text-red-600 hover:text-red-800"
                      >
                        {t('reviews.reject')}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
