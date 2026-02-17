import { useState, useEffect } from 'react';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Field, Label } from './catalyst/fieldset';
import { getApiBase, buildStoreUrl } from '../lib/api';
import { ErrorBoundary } from './ErrorBoundary';
import { useTranslation } from '../i18n';

type FormData = {
  name: string;
  email: string;
  subject: string;
  body: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

function ContactFormContent() {
  const { t } = useTranslation();

  const validate = (data: FormData): FormErrors => {
    const errors: FormErrors = {};
    if (!data.name.trim()) errors.name = t('contact.validationName');
    if (!data.email.trim()) {
      errors.email = t('contact.validationEmail');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = t('contact.validationEmailInvalid');
    }
    if (!data.subject.trim()) errors.subject = t('contact.validationSubject');
    if (!data.body.trim()) errors.body = t('contact.validationBody');
    return errors;
  };

  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    subject: '',
    body: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [honeypot, setHoneypot] = useState('');
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [csrfError, setCsrfError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const base = getApiBase();
        const res = await fetch(`${base}/csrf-token`, { credentials: 'include' });
        if (!res.ok) {
          setCsrfError(true);
          return;
        }
        const data = await res.json();
        if (typeof data.token !== 'string' || !data.token) {
          setCsrfError(true);
          return;
        }
        setCsrfToken(data.token);
      } catch {
        setCsrfError(true);
      }
    };
    fetchCsrfToken();
  }, []);

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

    if (honeypot) {
      setSubmitted(true);
      return;
    }

    if (!csrfToken) {
      setSubmitError(t('contact.csrfError'));
      return;
    }

    setSubmitting(true);
    try {
      const base = getApiBase();
      const url = buildStoreUrl('/contact', base);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to submit');
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t('contact.submitError')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div role="status" className="rounded-2xl bg-white p-8 text-center shadow-sm border border-gray-200">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">{t('contact.success')}</h3>
        <p className="mt-2 text-sm text-gray-500">
          {t('contact.successDescription')}
        </p>
        <div className="mt-6">
          <Button href="/" outline>
            {t('contact.backToHome')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {csrfError && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {t('contact.csrfError')}
        </div>
      )}

      {submitError && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {submitError}
        </div>
      )}

      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Field>
        <Label>{t('contact.name')}</Label>
        <Input
          name="name"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={t('contact.namePlaceholder')}
          invalid={!!errors.name}
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'contact-name-error' : undefined}
        />
        {errors.name && <p id="contact-name-error" className="mt-1 text-sm text-red-600" role="alert">{errors.name}</p>}
      </Field>

      <Field>
        <Label>{t('contact.email')}</Label>
        <Input
          name="email"
          type="email"
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder={t('contact.emailPlaceholder')}
          invalid={!!errors.email}
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'contact-email-error' : undefined}
        />
        {errors.email && <p id="contact-email-error" className="mt-1 text-sm text-red-600" role="alert">{errors.email}</p>}
      </Field>

      <Field>
        <Label>{t('contact.subject')}</Label>
        <Input
          name="subject"
          value={form.subject}
          onChange={(e) => handleChange('subject', e.target.value)}
          placeholder={t('contact.subjectPlaceholder')}
          invalid={!!errors.subject}
          aria-required="true"
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? 'contact-subject-error' : undefined}
        />
        {errors.subject && <p id="contact-subject-error" className="mt-1 text-sm text-red-600" role="alert">{errors.subject}</p>}
      </Field>

      <Field>
        <Label>{t('contact.body')}</Label>
        <Textarea
          name="body"
          value={form.body}
          onChange={(e) => handleChange('body', e.target.value)}
          placeholder={t('contact.bodyPlaceholder')}
          rows={6}
          invalid={!!errors.body}
          aria-required="true"
          aria-invalid={!!errors.body}
          aria-describedby={errors.body ? 'contact-body-error' : undefined}
        />
        {errors.body && <p id="contact-body-error" className="mt-1 text-sm text-red-600" role="alert">{errors.body}</p>}
      </Field>

      <Button type="submit" color="dark/zinc" className="w-full" disabled={submitting || csrfError}>
        {submitting ? t('contact.submitting') : t('contact.submit')}
      </Button>
    </form>
  );
}

export default function ContactForm() {
  return (
    <ErrorBoundary>
      <ContactFormContent />
    </ErrorBoundary>
  );
}
