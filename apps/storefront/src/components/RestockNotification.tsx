import { useState } from 'react';
import { getApiBase, buildStoreUrl } from '../lib/api';
import { useTranslation } from '../i18n';

type Props = {
  productId: number | string;
};

export default function RestockNotification({ productId }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage(t('restock.invalidEmail'));
      return;
    }

    setStatus('submitting');
    try {
      const url = buildStoreUrl(`/products/${productId}/notify`, getApiBase());
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || t('restock.error'));
      }

      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : t('restock.error')
      );
    }
  };

  if (status === 'success') {
    return (
      <div className="mt-4 rounded-md bg-success-light p-4" role="status">
        <div className="flex">
          <svg className="size-5 text-success" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <p className="ml-3 text-sm font-medium text-success">
            {t('restock.success')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="text-sm font-medium text-neutral-900">
        {t('restock.title')}
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        {t('restock.description')}
      </p>
      <form onSubmit={handleSubmit} className="mt-3">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            onBlur={() => {
              if (errorMessage) setErrorMessage('');
              if (status === 'error') setStatus('idle');
            }}
            placeholder={t('restock.emailPlaceholder')}
            aria-label={t('restock.emailPlaceholder')}
            maxLength={254}
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-neutral-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
            disabled={status === 'submitting'}
          />
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand-active transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {status === 'submitting' ? t('restock.submitting') : t('restock.subscribe')}
          </button>
        </div>
        <div aria-live="assertive">
          {errorMessage && (
            <p className="mt-2 text-xs text-danger" role="alert">{errorMessage}</p>
          )}
        </div>
      </form>
    </div>
  );
}
