import { useState } from 'react';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Field, Label } from './catalyst/fieldset';
import { getApiBase, buildStoreUrl } from '../lib/api';

type FormData = {
  name: string;
  email: string;
  subject: string;
  body: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

const validate = (data: FormData): FormErrors => {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = 'お名前を入力してください';
  if (!data.email.trim()) {
    errors.email = 'メールアドレスを入力してください';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = '有効なメールアドレスを入力してください';
  }
  if (!data.subject.trim()) errors.subject = '件名を入力してください';
  if (!data.body.trim()) errors.body = 'お問い合わせ内容を入力してください';
  return errors;
};

export default function ContactForm() {
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    subject: '',
    body: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const url = buildStoreUrl('/contact', getApiBase());
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to submit');
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : '送信に失敗しました。しばらくしてからもう一度お試しください。'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-gray-200">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">お問い合わせを受け付けました</h3>
        <p className="mt-2 text-sm text-gray-500">
          確認メールをお送りしました。担当者より順次ご対応いたします。
        </p>
        <div className="mt-6">
          <Button href="/" outline>
            ホームに戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {submitError}
        </div>
      )}

      <Field>
        <Label>お名前</Label>
        <Input
          name="name"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="山田 太郎"
          invalid={!!errors.name}
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </Field>

      <Field>
        <Label>メールアドレス</Label>
        <Input
          name="email"
          type="email"
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="example@email.com"
          invalid={!!errors.email}
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
      </Field>

      <Field>
        <Label>件名</Label>
        <Input
          name="subject"
          value={form.subject}
          onChange={(e) => handleChange('subject', e.target.value)}
          placeholder="お問い合わせの件名"
          invalid={!!errors.subject}
        />
        {errors.subject && <p className="mt-1 text-sm text-red-600">{errors.subject}</p>}
      </Field>

      <Field>
        <Label>お問い合わせ内容</Label>
        <Textarea
          name="body"
          value={form.body}
          onChange={(e) => handleChange('body', e.target.value)}
          placeholder="お問い合わせ内容をご記入ください"
          rows={6}
          invalid={!!errors.body}
        />
        {errors.body && <p className="mt-1 text-sm text-red-600">{errors.body}</p>}
      </Field>

      <Button type="submit" color="dark" className="w-full" disabled={submitting}>
        {submitting ? '送信中...' : '送信する'}
      </Button>
    </form>
  );
}
