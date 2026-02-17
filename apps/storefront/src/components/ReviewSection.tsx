import { useState, useEffect } from 'react';
import { StarRatingDisplay, StarRatingInput } from './StarRating';
import { getApiBase, fetchJson } from '../lib/api';
import { formatDate } from '../lib/format';
import { useTranslation } from '../i18n';
import { EmptyStateReact } from './EmptyStateReact';

type Review = {
  id: number;
  customer_name: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
};

type ReviewsResponse = {
  ok: boolean;
  reviews: Review[];
  averageRating: number | null;
  reviewCount: number;
};

type Props = {
  productId: number;
};

function ReviewForm({ productId, onSubmitted }: { productId: number; onSubmitted: () => void }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 || !title.trim() || !body.trim() || !name.trim() || !email.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      await fetchJson(`${getApiBase()}/store/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, title: title.trim(), body: body.trim(), name: name.trim(), email: email.trim() }),
      });
      setSuccess(true);
      setRating(0);
      setTitle('');
      setBody('');
      setName('');
      setEmail('');
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reviews.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-lg bg-success-light border border-success/20 p-4 text-sm text-success">
        {t('reviews.submitSuccess')}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">{t('reviews.rating')}</label>
        <StarRatingInput value={rating} onChange={setRating} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="review-name" className="block text-sm font-medium text-neutral-700 mb-1">
            {t('reviews.yourName')}
          </label>
          <input
            id="review-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('reviews.yourNamePlaceholder')}
            className="w-full rounded-md border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
            required
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="review-email" className="block text-sm font-medium text-neutral-700 mb-1">
            {t('reviews.yourEmail')}
          </label>
          <input
            id="review-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('reviews.yourEmailPlaceholder')}
            className="w-full rounded-md border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
            required
            maxLength={255}
          />
        </div>
      </div>

      <div>
        <label htmlFor="review-title" className="block text-sm font-medium text-neutral-700 mb-1">
          {t('reviews.reviewTitle')}
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('reviews.reviewTitlePlaceholder')}
          className="w-full rounded-md border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
          required
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="review-body" className="block text-sm font-medium text-neutral-700 mb-1">
          {t('reviews.reviewBody')}
        </label>
        <textarea
          id="review-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('reviews.reviewBodyPlaceholder')}
          className="w-full rounded-md border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
          required
          maxLength={5000}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting || rating === 0}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-active disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? t('reviews.submitting') : t('reviews.submit')}
      </button>
    </form>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const formattedDate = formatDate(review.created_at, 'DATE_LONG');

  return (
    <div className="border-b border-neutral-200 py-6 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StarRatingDisplay rating={review.rating} size="sm" />
          <span className="text-sm font-medium text-neutral-900">{review.customer_name}</span>
        </div>
        <span className="text-xs text-neutral-500">{formattedDate}</span>
      </div>
      <h4 className="mt-2 text-sm font-medium text-neutral-900">{review.title}</h4>
      <p className="mt-1 text-sm text-neutral-600 whitespace-pre-line">{review.body}</p>
    </div>
  );
}

export default function ReviewSection({ productId }: Props) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadReviews = async () => {
    try {
      const data = await fetchJson<ReviewsResponse>(
        `${getApiBase()}/store/products/${productId}/reviews`
      );
      setReviews(data.reviews || []);
      setAverageRating(data.averageRating);
      setReviewCount(data.reviewCount || 0);
    } catch {
      // Silently fail - reviews are non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [productId]);

  if (loading) {
    return (
      <div className="mt-10 border-t border-neutral-200 pt-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-neutral-200 rounded" />
          <div className="h-4 w-32 bg-neutral-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 border-t border-neutral-200 pt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-neutral-900">{t('reviews.title')}</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-brand hover:text-brand-active"
          >
            {t('reviews.writeReview')}
          </button>
        )}
      </div>

      {/* Average rating summary */}
      {averageRating !== null && reviewCount > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <StarRatingDisplay rating={averageRating} size="md" showValue />
          <span className="text-sm text-neutral-500">
            {t('reviews.basedOnReviews', { count: String(reviewCount) })}
          </span>
        </div>
      )}

      {/* Review form */}
      {showForm && (
        <div className="mt-6 rounded-lg bg-neutral-50 p-6">
          <h3 className="text-sm font-medium text-neutral-900 mb-4">{t('reviews.writeReview')}</h3>
          <ReviewForm productId={productId} onSubmitted={loadReviews} />
        </div>
      )}

      {/* Reviews list */}
      {reviews.length > 0 ? (
        <div className="mt-6">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyStateReact
            icon="review"
            title={t('reviews.noReviews')}
            description={t('reviews.noReviewsDescription')}
            compact
          >
            {!showForm && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="text-sm font-medium text-brand hover:text-brand-active"
                >
                  {t('reviews.beFirstToReview')}
                </button>
              </div>
            )}
          </EmptyStateReact>
        </div>
      )}
    </div>
  );
}
