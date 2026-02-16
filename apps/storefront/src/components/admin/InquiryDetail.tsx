import { useState } from 'react';
import { Heading, Subheading } from '../catalyst/heading';
import { Badge } from '../catalyst/badge';
import { Button } from '../catalyst/button';
import { Textarea } from '../catalyst/textarea';
import { Field, Label } from '../catalyst/fieldset';
import { getInquiryBadgeColor, getInquiryStatusLabel } from '../../lib/adminUtils';

type Inquiry = {
  id: number;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  inquiry: Inquiry;
  apiBase: string;
};

export default function InquiryDetail({ inquiry: initialInquiry, apiBase }: Props) {
  const [inquiry, setInquiry] = useState(initialInquiry);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${apiBase}/admin/inquiries/${inquiry.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reply }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to send reply');
      }

      setInquiry((prev) => ({
        ...prev,
        status: 'replied',
        admin_reply: reply,
        replied_at: new Date().toISOString(),
      }));
      setReply('');
      setMessage({
        type: 'success',
        text: data.emailSent ? '返信を送信しました。' : '返信を保存しました（メール送信に失敗しました）。',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '返信の送信に失敗しました。',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${apiBase}/admin/inquiries/${inquiry.id}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to close');
      }

      setInquiry((prev) => ({ ...prev, status: 'closed' }));
      setMessage({ type: 'success', text: 'お問い合わせをクローズしました。' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'クローズに失敗しました。',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/admin/inquiries" className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </a>
          <Heading>お問い合わせ #{inquiry.id}</Heading>
          <Badge color={getInquiryBadgeColor(inquiry.status)}>
            {getInquiryStatusLabel(inquiry.status)}
          </Badge>
        </div>
        {inquiry.status !== 'closed' && (
          <Button onClick={handleClose} disabled={submitting} outline>
            クローズ
          </Button>
        )}
      </div>

      {message && (
        <div
          className={`rounded-lg p-4 text-sm border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Inquiry details */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-zinc-200 space-y-4">
        <Subheading>{inquiry.subject}</Subheading>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">お名前:</span>{' '}
            <span className="font-medium">{inquiry.name}</span>
          </div>
          <div>
            <span className="text-zinc-500">メール:</span>{' '}
            <a href={`mailto:${inquiry.email}`} className="text-indigo-600 hover:text-indigo-800">
              {inquiry.email}
            </a>
          </div>
          <div>
            <span className="text-zinc-500">受付日時:</span>{' '}
            <span className="tabular-nums">
              {new Date(inquiry.created_at).toLocaleString('ja-JP')}
            </span>
          </div>
          {inquiry.replied_at && (
            <div>
              <span className="text-zinc-500">返信日時:</span>{' '}
              <span className="tabular-nums">
                {new Date(inquiry.replied_at).toLocaleString('ja-JP')}
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 pt-4">
          <p className="text-sm text-zinc-500 mb-1">お問い合わせ内容:</p>
          <div className="text-sm text-zinc-900 whitespace-pre-wrap">{inquiry.body}</div>
        </div>
      </div>

      {/* Admin reply (if exists) */}
      {inquiry.admin_reply && (
        <div className="rounded-xl bg-indigo-50 p-6 border border-indigo-200 space-y-2">
          <Subheading>管理者からの返信</Subheading>
          <div className="text-sm text-zinc-900 whitespace-pre-wrap">{inquiry.admin_reply}</div>
        </div>
      )}

      {/* Reply form */}
      {inquiry.status !== 'closed' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-zinc-200 space-y-4">
          <Subheading>返信</Subheading>
          <Field>
            <Label>返信内容</Label>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="返信内容を入力してください..."
              rows={6}
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={handleReply} disabled={submitting || !reply.trim()} color="indigo">
              {submitting ? '送信中...' : 'メールで返信する'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
