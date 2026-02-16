import { useState } from 'react';
import { getApiBase, buildStoreUrl } from '../lib/api';
import { useTranslation } from '../i18n';

export default function NewsletterForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage(t('newsletter.invalidEmail'));
      return;
    }

    setStatus('submitting');
    try {
      const url = buildStoreUrl('/newsletter/subscribe', getApiBase());
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to subscribe');
      }

      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : t('newsletter.error')
      );
    }
  };

  if (status === 'success') {
    return (
      <p className="text-[11px] text-green-600 font-medium">
        {t('newsletter.success')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errorMessage) setErrorMessage('');
            if (status === 'error') setStatus('idle');
          }}
          placeholder={t('newsletter.placeholder')}
          className="flex-1 min-w-0 px-3 py-1.5 text-[11px] bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand text-primary placeholder-muted"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="px-4 py-1.5 text-[11px] font-medium text-white bg-primary rounded-md hover:bg-[#333] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {status === 'submitting' ? t('newsletter.subscribing') : t('newsletter.subscribe')}
        </button>
      </div>
      {errorMessage && (
        <p className="text-[11px] text-red-500">{errorMessage}</p>
      )}
    </form>
  );
}
