import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import dailyCloseArtifacts from '../../../routes/accounting/dailyCloseArtifacts';

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

vi.mock('../../../services/dailyReport', () => ({
  generateDailyReport: vi.fn(),
}));

vi.mock('../../../services/stripeEvidence', () => ({
  generateStripeEvidence: vi.fn(),
}));

vi.mock('../../../services/renderDailyCloseHtml', () => ({
  renderDailyCloseHtml: vi.fn(),
}));

vi.mock('../../../lib/r2', () => ({
  putJson: vi.fn(),
  putText: vi.fn(),
}));

vi.mock('../../../services/journalize', () => ({
  journalizeDailyClose: vi.fn(),
}));

vi.mock('../../../services/inboxAnomalies', () => ({
  enqueueDailyCloseAnomaly: vi.fn(),
}));

vi.mock('../../../services/documents', () => ({
  listDocuments: vi.fn(),
  upsertDocument: vi.fn(),
}));

vi.mock('../../../services/dailyCloseRuns', () => ({
  startDailyCloseRun: vi.fn(),
  completeDailyCloseRun: vi.fn(),
  getLatestRunForDate: vi.fn(),
  listDailyCloseRuns: vi.fn(),
}));

import { generateDailyReport } from '../../../services/dailyReport';
import { generateStripeEvidence } from '../../../services/stripeEvidence';
import { renderDailyCloseHtml } from '../../../services/renderDailyCloseHtml';
import { putJson, putText } from '../../../lib/r2';
import { journalizeDailyClose } from '../../../services/journalize';
import { enqueueDailyCloseAnomaly } from '../../../services/inboxAnomalies';
import { listDocuments, upsertDocument } from '../../../services/documents';
import {
  startDailyCloseRun,
  completeDailyCloseRun,
  getLatestRunForDate,
  listDailyCloseRuns,
} from '../../../services/dailyCloseRuns';

const createMockR2 = () => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
});

const createApp = (overrides: Record<string, unknown> = {}) => {
  const app = new Hono();
  app.route('/', dailyCloseArtifacts);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: {},
        R2: createMockR2(),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        ...overrides,
      } as any),
  };
};

describe('Daily Close Artifacts Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /daily-close/:date/artifacts', () => {
    it('generates artifacts for a valid date', async () => {
      const mockReport = {
        date: '2026-01-13',
        payments: { totalAmount: 10000, totalFee: 300, count: 5 },
        refunds: { totalAmount: 1000, count: 1 },
      };

      (startDailyCloseRun as any).mockResolvedValueOnce(1);
      (generateDailyReport as any).mockResolvedValueOnce(mockReport);
      (generateStripeEvidence as any).mockResolvedValueOnce({ charges: [] });
      (renderDailyCloseHtml as any).mockReturnValueOnce('<html>report</html>');
      (putJson as any).mockResolvedValue(undefined);
      (putText as any).mockResolvedValue(undefined);
      (upsertDocument as any).mockResolvedValue(undefined);
      (journalizeDailyClose as any).mockResolvedValueOnce({
        entriesCreated: 4,
        skipped: false,
      });
      (enqueueDailyCloseAnomaly as any).mockResolvedValueOnce(false);
      (completeDailyCloseRun as any).mockResolvedValue(undefined);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-13/artifacts', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.date).toBe('2026-01-13');
      expect(data.runId).toBe(1);
      expect(data.keys).toBeDefined();
      expect(data.keys.reportKey).toContain('report.json');
      expect(data.keys.evidenceKey).toContain('stripe-evidence.json');
      expect(data.keys.htmlKey).toContain('report.html');
      expect(data.ledgerEntriesCreated).toBe(4);
      expect(data.anomalyDetected).toBe(false);
    });

    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/invalid-date/artifacts', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Invalid date');
    });

    it('uploads artifacts to R2', async () => {
      (startDailyCloseRun as any).mockResolvedValueOnce(2);
      (generateDailyReport as any).mockResolvedValueOnce({
        date: '2026-01-13',
        payments: { totalAmount: 5000, totalFee: 150, count: 2 },
        refunds: { totalAmount: 0, count: 0 },
      });
      (generateStripeEvidence as any).mockResolvedValueOnce({ charges: [] });
      (renderDailyCloseHtml as any).mockReturnValueOnce('<html></html>');
      (putJson as any).mockResolvedValue(undefined);
      (putText as any).mockResolvedValue(undefined);
      (upsertDocument as any).mockResolvedValue(undefined);
      (journalizeDailyClose as any).mockResolvedValueOnce({
        entriesCreated: 2,
        skipped: false,
      });
      (enqueueDailyCloseAnomaly as any).mockResolvedValueOnce(false);
      (completeDailyCloseRun as any).mockResolvedValue(undefined);

      const { fetch } = createApp();

      await fetch('/daily-close/2026-01-13/artifacts', { method: 'POST' });

      expect(putJson).toHaveBeenCalledTimes(2);
      expect(putText).toHaveBeenCalledTimes(1);
    });

    it('handles anomaly detection', async () => {
      (startDailyCloseRun as any).mockResolvedValueOnce(3);
      (generateDailyReport as any).mockResolvedValueOnce({
        date: '2026-01-13',
        payments: { totalAmount: 100000, totalFee: 3000, count: 50 },
        refunds: { totalAmount: 50000, count: 25 },
      });
      (generateStripeEvidence as any).mockResolvedValueOnce({ charges: [] });
      (renderDailyCloseHtml as any).mockReturnValueOnce('<html></html>');
      (putJson as any).mockResolvedValue(undefined);
      (putText as any).mockResolvedValue(undefined);
      (upsertDocument as any).mockResolvedValue(undefined);
      (journalizeDailyClose as any).mockResolvedValueOnce({
        entriesCreated: 6,
        skipped: false,
      });
      (enqueueDailyCloseAnomaly as any).mockResolvedValueOnce(true);
      (completeDailyCloseRun as any).mockResolvedValue(undefined);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-13/artifacts', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.anomalyDetected).toBe(true);
    });

    it('handles report generation failure', async () => {
      (startDailyCloseRun as any).mockResolvedValueOnce(4);
      (generateDailyReport as any).mockRejectedValueOnce(
        new Error('No data for date')
      );
      (completeDailyCloseRun as any).mockResolvedValue(undefined);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-13/artifacts', {
        method: 'POST',
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);

      expect(completeDailyCloseRun).toHaveBeenCalledWith(
        expect.any(Object),
        4,
        expect.objectContaining({ status: 'failed' })
      );
    });

    it('passes force flag when set', async () => {
      (startDailyCloseRun as any).mockResolvedValueOnce(5);
      (generateDailyReport as any).mockResolvedValueOnce({
        date: '2026-01-13',
        payments: { totalAmount: 5000, totalFee: 150, count: 2 },
        refunds: { totalAmount: 0, count: 0 },
      });
      (generateStripeEvidence as any).mockResolvedValueOnce({ charges: [] });
      (renderDailyCloseHtml as any).mockReturnValueOnce('<html></html>');
      (putJson as any).mockResolvedValue(undefined);
      (putText as any).mockResolvedValue(undefined);
      (upsertDocument as any).mockResolvedValue(undefined);
      (journalizeDailyClose as any).mockResolvedValueOnce({
        entriesCreated: 2,
        skipped: false,
      });
      (enqueueDailyCloseAnomaly as any).mockResolvedValueOnce(false);
      (completeDailyCloseRun as any).mockResolvedValue(undefined);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-13/artifacts?force=true', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.forced).toBe(true);
    });
  });

  describe('GET /daily-close/:date/documents', () => {
    it('returns documents for a valid date', async () => {
      const documents = [
        { type: 'daily_close', date: '2026-01-13', key: 'daily-close/2026-01-13/report.json', content_type: 'application/json' },
        { type: 'daily_close', date: '2026-01-13', key: 'daily-close/2026-01-13/report.html', content_type: 'text/html' },
      ];

      (listDocuments as any).mockResolvedValueOnce(documents);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-13/documents');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.documents).toHaveLength(2);
    });

    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/not-a-date/documents');

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Invalid date');
    });

    it('returns empty array when no documents exist', async () => {
      (listDocuments as any).mockResolvedValueOnce([]);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2020-01-01/documents');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.documents).toHaveLength(0);
    });
  });

  describe('GET /daily-close/:date/status', () => {
    it('returns run status for a date', async () => {
      (getLatestRunForDate as any).mockResolvedValueOnce({
        id: 1,
        date: '2026-01-13',
        status: 'success',
        artifacts_generated: 3,
        ledger_entries_created: 4,
        anomaly_detected: 0,
      });

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-13/status');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.date).toBe('2026-01-13');
      expect(data.run.status).toBe('success');
    });

    it('returns null run when no run exists', async () => {
      (getLatestRunForDate as any).mockResolvedValueOnce(null);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2020-01-01/status');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.run).toBeNull();
    });

    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/bad-date/status');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /daily-close/runs', () => {
    it('returns paginated list of runs', async () => {
      const runs = [
        { id: 2, date: '2026-01-14', status: 'success' },
        { id: 1, date: '2026-01-13', status: 'success' },
      ];

      (listDailyCloseRuns as any).mockResolvedValueOnce(runs);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/runs?limit=10&offset=0');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.runs).toHaveLength(2);
    });

    it('uses default limit and offset', async () => {
      (listDailyCloseRuns as any).mockResolvedValueOnce([]);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/runs');

      expect(res.status).toBe(200);
      expect(listDailyCloseRuns).toHaveBeenCalledWith(
        expect.any(Object),
        { limit: 20, offset: 0 }
      );
    });
  });
});
