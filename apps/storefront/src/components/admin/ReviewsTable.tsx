import { useState, useEffect } from 'react';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { Badge } from '../catalyst/badge';
import { Button } from '../catalyst/button';
import { Select } from '../catalyst/select';
import { Field, Label } from '../catalyst/fieldset';
import { Link } from '../catalyst/link';
import { StarRatingDisplay } from '../StarRating';
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

import { getReviewBadgeColor } from '../../lib/adminUtils';

export default function ReviewsTable({ apiBase }: { apiBase: string }) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actioningId, setActioningId] = useState<number | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [statusFilter]);

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

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('reviews.pendingReview'),
      approved: t('reviews.approved'),
      rejected: t('reviews.rejected'),
    };
    return labels[status] || status;
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">{t('reviews.adminTitle')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} {t('admin.items')}</p>
        </div>
        <div className="mt-4 sm:mt-0">
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
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-zinc-100 rounded-lg" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p>{t('reviews.noReviewsAdmin')}</p>
        </div>
      ) : (
        <Table striped>
          <TableHead>
            <TableRow>
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
            {reviews.map((review) => (
              <TableRow key={review.id}>
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
                    {statusLabel(review.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 whitespace-nowrap tabular-nums">
                  {formatDate(review.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}
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
