import { useState } from 'react';
import { getApiBase, buildStoreUrl } from '../lib/api';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('有効なメールアドレスを入力してください');
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
        err instanceof Error ? err.message : '登録に失敗しました。しばらくしてからもう一度お試しください。'
      );
    }
  };

  if (status === 'success') {
    return (
      <p className="text-[11px] text-green-600 font-medium">
        ニュースレターに登録しました。
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
          placeholder="メールアドレスを入力"
          className="flex-1 min-w-0 px-3 py-1.5 text-[11px] bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0071e3] focus:border-[#0071e3] text-[#1d1d1f] placeholder-[#86868b]"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="px-4 py-1.5 text-[11px] font-medium text-white bg-[#1d1d1f] rounded-md hover:bg-[#333] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {status === 'submitting' ? '登録中...' : '登録'}
        </button>
      </div>
      {errorMessage && (
        <p className="text-[11px] text-red-500">{errorMessage}</p>
      )}
    </form>
  );
}
