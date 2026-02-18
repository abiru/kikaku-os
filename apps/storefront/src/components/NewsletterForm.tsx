import { useState } from 'react';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
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
      const base = getApiBase();
      const csrfRes = await fetch(`${base}/csrf-token`, { credentials: 'include' });
      const { token: csrfToken } = await csrfRes.json();

      const url = buildStoreUrl('/newsletter/subscribe', base);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
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
      <p className="text-xs text-success font-medium">
        {t('newsletter.success')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">{t('newsletter.placeholder')}</label>
        <Input
          id="newsletter-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errorMessage) setErrorMessage('');
            if (status === 'error') setStatus('idle');
          }}
          placeholder={t('newsletter.placeholder')}
          maxLength={254}
          aria-label={t('newsletter.placeholder')}
          className="flex-1 min-w-0"
          disabled={status === 'submitting'}
        />
        <Button
          type="submit"
          disabled={status === 'submitting'}
          color="dark/zinc"
          className="whitespace-nowrap"
        >
          {status === 'submitting' ? t('newsletter.subscribing') : t('newsletter.subscribe')}
        </Button>
      </div>
      {errorMessage && (
        <p className="text-xs text-danger">{errorMessage}</p>
      )}
    </form>
  );
}
