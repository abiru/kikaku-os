import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { escapeHtml } from '../../lib/html';
import { validationErrorHandler } from '../../lib/validation';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { sendEmail } from '../../services/email';
import {
  inquiryListQuerySchema,
  inquiryIdParamSchema,
  inquiryReplySchema,
} from '../../lib/schemas/contact';
import { PERMISSIONS } from '../../lib/schemas';
import { createLogger } from '../../lib/logger';

const logger = createLogger('admin-inquiries');
const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

type InquiryRow = {
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

// GET /inquiries - List inquiries with filtering and pagination
app.get(
  '/inquiries',
  requirePermission(PERMISSIONS.CUSTOMERS_READ),
  zValidator('query', inquiryListQuerySchema, validationErrorHandler),
  async (c) => {
    const { status, limit, offset } = c.req.valid('query');

    try {
      const countResult = await c.env.DB.prepare(
        'SELECT COUNT(*) as total FROM contact_inquiries WHERE status = ?'
      ).bind(status).first<{ total: number }>();

      const total = countResult?.total ?? 0;

      const rows = await c.env.DB.prepare(`
        SELECT id, name, email, subject, body, status, admin_reply, replied_at, created_at, updated_at
        FROM contact_inquiries
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(status, limit, offset).all<InquiryRow>();

      return jsonOk(c, {
        inquiries: rows.results || [],
        meta: { total, limit, offset },
      });
    } catch (err) {
      logger.error('Failed to fetch inquiries', { error: String(err) });
      return jsonError(c, 'Failed to fetch inquiries');
    }
  }
);

// GET /inquiries/:id - Get inquiry detail
app.get(
  '/inquiries/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_READ),
  zValidator('param', inquiryIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const inquiry = await c.env.DB.prepare(`
        SELECT id, name, email, subject, body, status, admin_reply, replied_at, created_at, updated_at
        FROM contact_inquiries
        WHERE id = ?
      `).bind(id).first<InquiryRow>();

      if (!inquiry) {
        return jsonError(c, 'Inquiry not found', 404);
      }

      return jsonOk(c, { inquiry });
    } catch (err) {
      logger.error('Failed to fetch inquiry', { error: String(err) });
      return jsonError(c, 'Failed to fetch inquiry');
    }
  }
);

// POST /inquiries/:id/reply - Reply to inquiry
app.post(
  '/inquiries/:id/reply',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  zValidator('param', inquiryIdParamSchema, validationErrorHandler),
  zValidator('json', inquiryReplySchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { reply } = c.req.valid('json');

    try {
      const inquiry = await c.env.DB.prepare(
        'SELECT id, name, email, subject, status FROM contact_inquiries WHERE id = ?'
      ).bind(id).first<InquiryRow>();

      if (!inquiry) {
        return jsonError(c, 'Inquiry not found', 404);
      }

      // Update inquiry with reply
      await c.env.DB.prepare(`
        UPDATE contact_inquiries
        SET admin_reply = ?, status = 'replied', replied_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(reply, id).run();

      // Send reply email
      const emailResult = await sendEmail(c.env, {
        to: inquiry.email,
        subject: `Re: ${inquiry.subject}`,
        html: buildReplyHtml(inquiry.name, inquiry.subject, reply),
        text: buildReplyText(inquiry.name, inquiry.subject, reply),
      });

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'reply_inquiry',
        `contact_inquiry:${id}`,
        JSON.stringify({ email: inquiry.email, emailSent: emailResult.success })
      ).run();

      return jsonOk(c, { emailSent: emailResult.success });
    } catch (err) {
      logger.error('Failed to reply to inquiry', { error: String(err) });
      return jsonError(c, 'Failed to reply to inquiry');
    }
  }
);

// POST /inquiries/:id/close - Close inquiry
app.post(
  '/inquiries/:id/close',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  zValidator('param', inquiryIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const inquiry = await c.env.DB.prepare(
        'SELECT id FROM contact_inquiries WHERE id = ?'
      ).bind(id).first<{ id: number }>();

      if (!inquiry) {
        return jsonError(c, 'Inquiry not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE contact_inquiries
        SET status = 'closed', updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'close_inquiry', `contact_inquiry:${id}`, null).run();

      return jsonOk(c, {});
    } catch (err) {
      logger.error('Failed to close inquiry', { error: String(err) });
      return jsonError(c, 'Failed to close inquiry');
    }
  }
);

const buildReplyHtml = (name: string, subject: string, reply: string): string => {
  const escapedName = escapeHtml(name);
  const escapedSubject = escapeHtml(subject);
  const escapedReply = escapeHtml(reply).replace(/\n/g, '<br>');

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>お問い合わせへのご返信</h2>
      <p>${escapedName} 様</p>
      <p>お問い合わせいただきありがとうございます。以下の通りご回答いたします。</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p><strong>件名:</strong> ${escapedSubject}</p>
      <p><strong>回答:</strong></p>
      <p>${escapedReply}</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p style="color: #666; font-size: 12px;">Led Kikaku カスタマーサポート</p>
    </div>
  `;
};

const buildReplyText = (name: string, subject: string, reply: string): string => {
  return [
    'お問い合わせへのご返信',
    '',
    `${name} 様`,
    '',
    'お問い合わせいただきありがとうございます。以下の通りご回答いたします。',
    '',
    `件名: ${subject}`,
    '',
    '回答:',
    reply,
    '',
    '---',
    'Led Kikaku カスタマーサポート',
  ].join('\n');
};

export default app;
