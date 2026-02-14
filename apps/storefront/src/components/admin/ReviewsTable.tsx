import { useState, useEffect } from 'react';
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

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return styles[status] || 'bg-gray-100 text-gray-800';
};

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
          <h1 className="text-2xl font-semibold text-gray-900">{t('reviews.adminTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500">{total} {t('admin.items')}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="all">{t('reviews.all')}</option>
            <option value="pending">{t('reviews.pendingReview')}</option>
            <option value="approved">{t('reviews.approved')}</option>
            <option value="rejected">{t('reviews.rejected')}</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>{t('reviews.noReviewsAdmin')}</p>
        </div>
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.product')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.reviewer')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.rating')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.reviewTitle')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.status')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.date')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviews.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {reviews.map((review) => (
                <tr key={review.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-sm">
                    <a href={`/admin/products/${review.product_id}`} className="text-indigo-600 hover:text-indigo-900">
                      {review.product_title || `#${review.product_id}`}
                    </a>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="font-medium text-gray-900">{review.customer_name}</div>
                    <div className="text-gray-500 text-xs">{review.customer_email}</div>
                  </td>
                  <td className="px-4 py-4">
                    <StarRatingDisplay rating={review.rating} size="sm" />
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-900 max-w-xs">
                    <div className="font-medium truncate">{review.title}</div>
                    <div className="text-gray-500 text-xs truncate mt-0.5">{review.body}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(review.status)}`}>
                      {statusLabel(review.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(review.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    {review.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAction(review.id, 'approve')}
                          disabled={actioningId === review.id}
                          className="text-green-600 hover:text-green-900 font-medium disabled:opacity-50"
                        >
                          {t('reviews.approve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(review.id, 'reject')}
                          disabled={actioningId === review.id}
                          className="text-red-600 hover:text-red-900 font-medium disabled:opacity-50"
                        >
                          {t('reviews.reject')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
