import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminEmailTemplates from '../../../routes/admin/adminEmailTemplates';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockGetAllEmailTemplates = vi.fn();
const mockGetEmailTemplate = vi.fn();
const mockUpdateEmailTemplate = vi.fn();
const mockRenderTemplate = vi.fn();
const mockSendEmail = vi.fn();

vi.mock('../../../services/email', () => ({
  getAllEmailTemplates: (...args: any[]) => mockGetAllEmailTemplates(...args),
  getEmailTemplate: (...args: any[]) => mockGetEmailTemplate(...args),
  updateEmailTemplate: (...args: any[]) => mockUpdateEmailTemplate(...args),
  renderTemplate: (...args: any[]) => mockRenderTemplate(...args),
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = () => {
  return {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminEmailTemplates);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

const sampleTemplate = {
  id: 1,
  slug: 'order-confirmation',
  name: '注文確認',
  subject: 'ご注文ありがとうございます #{{order_number}}',
  body_html: '<h1>ご注文確認</h1><p>{{customer_name}} 様</p>',
  body_text: 'ご注文確認\n{{customer_name}} 様',
  variables: '["customer_name","order_number","order_date","total_amount"]',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Admin Email Templates API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/email-templates', () => {
    it('returns list of all email templates', async () => {
      const templates = [
        sampleTemplate,
        { ...sampleTemplate, id: 2, slug: 'shipping-notification', name: '発送通知' },
      ];

      mockGetAllEmailTemplates.mockResolvedValueOnce(templates);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.templates).toHaveLength(2);
      expect(json.templates[0].slug).toBe('order-confirmation');
    });

    it('returns empty list when no templates exist', async () => {
      mockGetAllEmailTemplates.mockResolvedValueOnce([]);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.templates).toHaveLength(0);
    });

    it('handles service errors gracefully', async () => {
      mockGetAllEmailTemplates.mockRejectedValueOnce(new Error('DB error'));

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch email templates');
    });
  });

  describe('GET /admin/email-templates/:slug', () => {
    it('returns a single email template with parsed variables', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(sampleTemplate);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.template.slug).toBe('order-confirmation');
      expect(json.template.variables).toEqual([
        'customer_name',
        'order_number',
        'order_date',
        'total_amount',
      ]);
    });

    it('returns 404 for non-existent template', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(null);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/non-existent', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Email template not found');
    });

    it('returns 400 for invalid slug format', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/INVALID_SLUG!', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });

    it('handles invalid variables JSON gracefully', async () => {
      const templateWithBadVars = { ...sampleTemplate, variables: 'not-json' };
      mockGetEmailTemplate.mockResolvedValueOnce(templateWithBadVars);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.template.variables).toEqual([]);
    });
  });

  describe('PUT /admin/email-templates/:slug', () => {
    it('updates an email template', async () => {
      const updatedTemplate = {
        ...sampleTemplate,
        subject: '更新された件名 #{{order_number}}',
        updated_at: '2026-02-01T00:00:00Z',
      };

      mockGetEmailTemplate.mockResolvedValueOnce(sampleTemplate);
      mockUpdateEmailTemplate.mockResolvedValueOnce(updatedTemplate);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: '更新された件名 #{{order_number}}',
          body_html: '<h1>Updated</h1>',
          body_text: 'Updated',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.template.subject).toBe('更新された件名 #{{order_number}}');
    });

    it('returns 404 for non-existent template', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(null);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/non-existent', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: 'Test',
          body_html: '<p>Test</p>',
          body_text: 'Test',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Email template not found');
    });

    it('returns 400 for missing required fields', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: 'Only subject',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty subject', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: '',
          body_html: '<p>body</p>',
          body_text: 'body',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/email-templates/:slug/preview', () => {
    it('sends a preview email successfully', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(sampleTemplate);
      mockRenderTemplate.mockReturnValueOnce({
        subject: '[テスト] ご注文ありがとうございます #12345',
        html: '<h1>ご注文確認</h1><p>テスト 太郎 様</p>',
        text: 'ご注文確認\nテスト 太郎 様',
      });
      mockSendEmail.mockResolvedValueOnce({
        success: true,
        messageId: 'msg_001',
      });

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation/preview', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
          variables: { customer_name: 'テスト花子' },
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.sent).toBe(true);
      expect(json.to).toBe('test@example.com');
      expect(json.messageId).toBe('msg_001');
    });

    it('returns 404 for non-existent template', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(null);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/non-existent/preview', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Email template not found');
    });

    it('returns 500 when email sending fails', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(sampleTemplate);
      mockRenderTemplate.mockReturnValueOnce({
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      });
      mockSendEmail.mockResolvedValueOnce({
        success: false,
        error: 'SMTP connection failed',
      });

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation/preview', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('SMTP connection failed');
    });

    it('returns 400 for invalid email address', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation/preview', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'not-an-email',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when to field is missing', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation/preview', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/email-templates/:slug/render', () => {
    it('renders a template with sample data', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(sampleTemplate);
      mockRenderTemplate.mockReturnValueOnce({
        subject: 'ご注文ありがとうございます #12345',
        html: '<h1>ご注文確認</h1><p>テスト 太郎 様</p>',
        text: 'ご注文確認\nテスト 太郎 様',
      });

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation/render', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.subject).toBe('ご注文ありがとうございます #12345');
      expect(json.html).toContain('ご注文確認');
      expect(json.text).toContain('テスト 太郎');
    });

    it('returns 404 for non-existent template', async () => {
      mockGetEmailTemplate.mockResolvedValueOnce(null);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/non-existent/render', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Email template not found');
    });

    it('handles render errors gracefully', async () => {
      mockGetEmailTemplate.mockRejectedValueOnce(new Error('DB error'));

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/email-templates/order-confirmation/render', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to render email template');
    });
  });
});
