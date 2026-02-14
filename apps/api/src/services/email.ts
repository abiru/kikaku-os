import { Resend } from 'resend';
import { Env } from '../env';
import { escapeHtml } from '../lib/html';

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type EmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export type EmailTemplate = {
  id: number;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  variables: string;
  created_at: string;
  updated_at: string;
};

export const sendEmail = async (
  env: Env['Bindings'],
  payload: EmailPayload
): Promise<EmailResult> => {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const fromEmail = env.RESEND_FROM_EMAIL || 'noreply@example.com';
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
    });

    if (error) {
      await recordNotification(env, payload, 'failed', error.message);
      return { success: false, error: error.message };
    }

    await recordNotification(env, payload, 'sent', undefined, data?.id);
    return { success: true, messageId: data?.id };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await recordNotification(env, payload, 'failed', errorMessage);
    return { success: false, error: errorMessage };
  }
};

const recordNotification = async (
  env: Env['Bindings'],
  payload: EmailPayload,
  status: 'sent' | 'failed',
  error?: string,
  messageId?: string
): Promise<void> => {
  const payloadJson = JSON.stringify({
    to: payload.to,
    subject: payload.subject,
    messageId,
  });

  if (status === 'sent') {
    await env.DB.prepare(
      `INSERT INTO notifications (channel, status, payload, sent_at)
       VALUES ('email', 'sent', ?, datetime('now'))`
    ).bind(payloadJson).run();
  } else {
    // Record failed notification
    await env.DB.prepare(
      `INSERT INTO notifications (channel, status, payload, response)
       VALUES ('email', 'failed', ?, ?)`
    ).bind(payloadJson, error || '').run();

    // Create inbox alert for admin review
    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, created_at, updated_at)
       VALUES (?, ?, 'warning', 'open', 'email_failure', datetime('now'), datetime('now'))`
    ).bind(
      `メール送信失敗: ${payload.subject}`,
      JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        error: error || 'Unknown error',
        timestamp: new Date().toISOString(),
      })
    ).run();
  }
};

export const getEmailTemplate = async (
  env: Env['Bindings'],
  slug: string
): Promise<EmailTemplate | null> => {
  const result = await env.DB.prepare(
    `SELECT * FROM email_templates WHERE slug = ?`
  ).bind(slug).first<EmailTemplate>();

  return result || null;
};

export const getAllEmailTemplates = async (
  env: Env['Bindings']
): Promise<EmailTemplate[]> => {
  const result = await env.DB.prepare(
    `SELECT * FROM email_templates ORDER BY name`
  ).all<EmailTemplate>();

  return result.results || [];
};

export const updateEmailTemplate = async (
  env: Env['Bindings'],
  slug: string,
  data: { subject?: string; body_html?: string; body_text?: string }
): Promise<EmailTemplate | null> => {
  const updates: string[] = [];
  const values: string[] = [];

  if (data.subject !== undefined) {
    updates.push('subject = ?');
    values.push(data.subject);
  }
  if (data.body_html !== undefined) {
    updates.push('body_html = ?');
    values.push(data.body_html);
  }
  if (data.body_text !== undefined) {
    updates.push('body_text = ?');
    values.push(data.body_text);
  }

  if (updates.length === 0) {
    return getEmailTemplate(env, slug);
  }

  updates.push("updated_at = datetime('now')");
  values.push(slug);

  await env.DB.prepare(
    `UPDATE email_templates SET ${updates.join(', ')} WHERE slug = ?`
  ).bind(...values).run();

  return getEmailTemplate(env, slug);
};

export type TemplateVariables = Record<string, string | number>;

export const renderTemplate = (
  template: EmailTemplate,
  variables: TemplateVariables
): { subject: string; html: string; text: string } => {
  const replaceVariables = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined) {
        return match;
      }
      return escapeHtml(String(value));
    });
  };

  const replaceVariablesPlainText = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined) {
        return match;
      }
      return String(value);
    });
  };

  return {
    subject: replaceVariablesPlainText(template.subject),
    html: replaceVariables(template.body_html),
    text: replaceVariablesPlainText(template.body_text),
  };
};

