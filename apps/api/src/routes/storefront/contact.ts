import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { escapeHtml } from '../../lib/html';
import { contactInquirySchema } from '../../lib/schemas/contact';
import { validationErrorHandler } from '../../lib/validation';
import { sendEmail } from '../../services/email';

const contact = new Hono<Env>();

// POST /store/contact - Public contact form submission
contact.post(
  '/contact',
  zValidator('json', contactInquirySchema, validationErrorHandler),
  async (c) => {
    const { name, email, subject, body } = c.req.valid('json');

    try {
      // Save to contact_inquiries
      const result = await c.env.DB.prepare(`
        INSERT INTO contact_inquiries (name, email, subject, body, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
      `).bind(name, email, subject, body).run();

      const inquiryId = result.meta.last_row_id;

      // Create inbox item for admin notification
      await c.env.DB.prepare(`
        INSERT INTO inbox_items (title, body, severity, status, kind, metadata, created_at, updated_at)
        VALUES (?, ?, 'info', 'open', 'contact_inquiry', ?, datetime('now'), datetime('now'))
      `).bind(
        `お問い合わせ: ${subject}`,
        `${name} (${email}) からのお問い合わせ:\n\n${body}`,
        JSON.stringify({ inquiry_id: inquiryId, name, email, subject })
      ).run();

      // Send confirmation email (non-blocking - failure doesn't affect submission)
      try {
        await sendEmail(c.env, {
          to: email,
          subject: `【Led Kikaku】お問い合わせを受け付けました: ${subject}`,
          html: buildConfirmationHtml(name, subject, body),
          text: buildConfirmationText(name, subject, body),
        });
      } catch {
        // Email failure is logged by sendEmail service; submission still succeeds
      }

      return jsonOk(c, { id: inquiryId });
    } catch (err) {
      console.error('Failed to save contact inquiry:', err);
      return jsonError(c, 'Failed to submit inquiry', 500);
    }
  }
);

const buildConfirmationHtml = (name: string, subject: string, body: string): string => {
  const escapedName = escapeHtml(name);
  const escapedSubject = escapeHtml(subject);
  const escapedBody = escapeHtml(body).replace(/\n/g, '<br>');

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>お問い合わせを受け付けました</h2>
      <p>${escapedName} 様</p>
      <p>以下の内容でお問い合わせを受け付けました。担当者より順次ご対応いたします。</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p><strong>件名:</strong> ${escapedSubject}</p>
      <p><strong>内容:</strong></p>
      <p>${escapedBody}</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p style="color: #666; font-size: 12px;">Led Kikaku カスタマーサポート</p>
    </div>
  `;
};

const buildConfirmationText = (name: string, subject: string, body: string): string => {
  return [
    'お問い合わせを受け付けました',
    '',
    `${name} 様`,
    '',
    '以下の内容でお問い合わせを受け付けました。担当者より順次ご対応いたします。',
    '',
    `件名: ${subject}`,
    '',
    '内容:',
    body,
    '',
    '---',
    'Led Kikaku カスタマーサポート',
  ].join('\n');
};

export default contact;
