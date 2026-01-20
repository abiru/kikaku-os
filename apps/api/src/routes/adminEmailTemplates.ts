import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import {
  emailTemplateSlugParamSchema,
  updateEmailTemplateSchema,
  previewEmailTemplateSchema,
} from '../lib/schemas';
import {
  getAllEmailTemplates,
  getEmailTemplate,
  updateEmailTemplate,
  renderTemplate,
  sendEmail,
  EmailTemplate,
} from '../services/email';

const app = new Hono<Env>();

const validationErrorHandler = (
  result: { success: boolean; error?: { issues: Array<{ message: string }> } },
  c: any
) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

// GET /email-templates - List all email templates
app.get('/email-templates', async (c) => {
  try {
    const templates = await getAllEmailTemplates(c.env);

    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind('admin', 'view_email_templates', 'admin_email_templates_list', JSON.stringify({ count: templates.length })).run();

    return jsonOk(c, { templates });
  } catch (e) {
    console.error(e);
    return jsonError(c, 'Failed to fetch email templates');
  }
});

// GET /email-templates/:slug - Get single email template
app.get(
  '/email-templates/:slug',
  zValidator('param', emailTemplateSlugParamSchema, validationErrorHandler),
  async (c) => {
    const { slug } = c.req.valid('param');

    try {
      const template = await getEmailTemplate(c.env, slug);

      if (!template) {
        return jsonError(c, 'Email template not found', 404);
      }

      let variables: string[] = [];
      try {
        variables = JSON.parse(template.variables);
      } catch {
        variables = [];
      }

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'view_email_template', `email_template:${slug}`, JSON.stringify({ slug })).run();

      return jsonOk(c, {
        template: {
          ...template,
          variables,
        },
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch email template');
    }
  }
);

// PUT /email-templates/:slug - Update email template
app.put(
  '/email-templates/:slug',
  zValidator('param', emailTemplateSlugParamSchema, validationErrorHandler),
  zValidator('json', updateEmailTemplateSchema, validationErrorHandler),
  async (c) => {
    const { slug } = c.req.valid('param');
    const data = c.req.valid('json');

    try {
      const existing = await getEmailTemplate(c.env, slug);

      if (!existing) {
        return jsonError(c, 'Email template not found', 404);
      }

      const updated = await updateEmailTemplate(c.env, slug, {
        subject: data.subject,
        body_html: data.body_html,
        body_text: data.body_text,
      });

      let variables: string[] = [];
      try {
        variables = JSON.parse(updated?.variables || '[]');
      } catch {
        variables = [];
      }

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'update_email_template', `email_template:${slug}`, JSON.stringify({ slug })).run();

      return jsonOk(c, {
        template: updated ? { ...updated, variables } : null,
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update email template');
    }
  }
);

// POST /email-templates/:slug/preview - Send preview email
app.post(
  '/email-templates/:slug/preview',
  zValidator('param', emailTemplateSlugParamSchema, validationErrorHandler),
  zValidator('json', previewEmailTemplateSchema, validationErrorHandler),
  async (c) => {
    const { slug } = c.req.valid('param');
    const { to, variables } = c.req.valid('json');

    try {
      const template = await getEmailTemplate(c.env, slug);

      if (!template) {
        return jsonError(c, 'Email template not found', 404);
      }

      // Use sample data for missing variables
      const sampleData: Record<string, string | number> = {
        customer_name: 'テスト 太郎',
        order_number: '12345',
        order_date: new Date().toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        total_amount: '10,000',
        carrier: 'ヤマト運輸',
        tracking_number: '1234-5678-9012',
        ...variables,
      };

      const rendered = renderTemplate(template, sampleData);

      const result = await sendEmail(c.env, {
        to,
        subject: `[テスト] ${rendered.subject}`,
        html: rendered.html,
        text: rendered.text,
      });

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        'admin',
        'preview_email_template',
        `email_template:${slug}`,
        JSON.stringify({ slug, to, success: result.success })
      ).run();

      if (!result.success) {
        return jsonError(c, result.error || 'Failed to send preview email', 500);
      }

      return jsonOk(c, {
        sent: true,
        to,
        messageId: result.messageId,
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to send preview email');
    }
  }
);

// POST /email-templates/:slug/render - Render template without sending
app.post(
  '/email-templates/:slug/render',
  zValidator('param', emailTemplateSlugParamSchema, validationErrorHandler),
  async (c) => {
    const { slug } = c.req.valid('param');

    try {
      const template = await getEmailTemplate(c.env, slug);

      if (!template) {
        return jsonError(c, 'Email template not found', 404);
      }

      // Use sample data for preview
      const sampleData: Record<string, string | number> = {
        customer_name: 'テスト 太郎',
        order_number: '12345',
        order_date: new Date().toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        total_amount: '10,000',
        carrier: 'ヤマト運輸',
        tracking_number: '1234-5678-9012',
      };

      const rendered = renderTemplate(template, sampleData);

      return jsonOk(c, {
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to render email template');
    }
  }
);

export default app;
