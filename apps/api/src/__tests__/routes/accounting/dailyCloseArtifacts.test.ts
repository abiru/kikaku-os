import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import dailyCloseArtifacts from '../../../routes/accounting/dailyCloseArtifacts';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockGenerateDailyReport = vi.fn();
const mockGenerateStripeEvidence = vi.fn();
const mockRenderDailyCloseHtml = vi.fn();
const mockPutJson = vi.fn();
const mockPutText = vi.fn();
const mockJournalizeDailyClose = vi.fn();
const mockEnqueueDailyCloseAnomaly = vi.fn();
const mockListDocuments = vi.fn();
const mockUpsertDocument = vi.fn();
const mockStartDailyCloseRun = vi.fn();
const mockCompleteDailyCloseRun = vi.fn();
const mockGetLatestRunForDate = vi.fn();
const mockListDailyCloseRuns = vi.fn();

vi.mock('../../../services/dailyReport', () => ({
  generateDailyReport: (...args: unknown[]) => mockGenerateDailyReport(...args),
}));

vi.mock('../../../services/stripeEvidence', () => ({
  generateStripeEvidence: (...args: unknown[]) => mockGenerateStripeEvidence(...args),
}));

vi.mock('../../../services/renderDailyCloseHtml', () => ({
  renderDailyCloseHtml: (...args: unknown[]) => mockRenderDailyCloseHtml(...args),
}));

vi.mock('../../../lib/r2', () => ({
  putJson: (...args: unknown[]) => mockPutJson(...args),
  putText: (...args: unknown[]) => mockPutText(...args),
}));

vi.mock('../../../services/journalize', () => ({
  journalizeDailyClose: (...args: unknown[]) => mockJournalizeDailyClose(...args),
}));

vi.mock('../../../services/inboxAnomalies', () => ({
  enqueueDailyCloseAnomaly: (...args: unknown[]) => mockEnqueueDailyCloseAnomaly(...args),
}));

vi.mock('../../../services/documents', () => ({
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
  upsertDocument: (...args: unknown[]) => mockUpsertDocument(...args),
}));

vi.mock('../../../services/dailyCloseRuns', () => ({
  startDailyCloseRun: (...args: unknown[]) => mockStartDailyCloseRun(...args),
  completeDailyCloseRun: (...args: unknown[]) => mockCompleteDailyCloseRun(...args),
  getLatestRunForDate: (...args: unknown[]) => mockGetLatestRunForDate(...args),
  listDailyCloseRuns: (...args: unknown[]) => mockListDailyCloseRuns(...args),
}));

const ADMIN_KEY = 'test-admin-key';

const mockR2 = {
  put: vi.fn(async () => ({})),
  get: vi.fn(async () => null),
  list: vi.fn(async () => ({ objects: [] })),
};

const createApp = () => {
  const app = new Hono();
  app.route('/', dailyCloseArtifacts);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: {}, R2: mockR2, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

const sampleReport = {
  date: '2026-01-15',
  orders: { count: 5, totalNet: 50000, totalFee: 1500 },
  payments: { count: 5, totalAmount: 50000, totalFee: 1500 },
  refunds: { count: 0, totalAmount: 0 },
  anomalies: { level: 'ok' as const, diff: 0, message: 'No anomalies' },
};

const sampleEvidence = {
  payments: [{ id: 1, amount: 10000, fee: 300, created_at: '2026-01-15T10:00:00Z', method: 'card', provider: 'stripe' }],
  refunds: [],
};

const setupSuccessfulRun = () => {
  mockStartDailyCloseRun.mockResolvedValue(42);
  mockGenerateDailyReport.mockResolvedValue(sampleReport);
  mockGenerateStripeEvidence.mockResolvedValue(sampleEvidence);
  mockRenderDailyCloseHtml.mockReturnValue('<html>report</html>');
  mockPutJson.mockResolvedValue(undefined);
  mockPutText.mockResolvedValue(undefined);
  mockUpsertDocument.mockResolvedValue(undefined);
  mockJournalizeDailyClose.mockResolvedValue({ entriesCreated: 4, skipped: false });
  mockEnqueueDailyCloseAnomaly.mockResolvedValue(false);
  mockCompleteDailyCloseRun.mockResolvedValue(undefined);
};

describe('Daily Close Artifacts API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /daily-close/:date/artifacts', () => {
    it('generates artifacts successfully', async () => {
      setupSuccessfulRun();

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.date).toBe('2026-01-15');
      expect(json.runId).toBe(42);
      expect(json.keys.reportKey).toBe('daily-close/2026-01-15/report.json');
      expect(json.keys.evidenceKey).toBe('daily-close/2026-01-15/stripe-evidence.json');
      expect(json.keys.htmlKey).toBe('daily-close/2026-01-15/report.html');
      expect(json.ledgerEntriesCreated).toBe(4);
      expect(json.anomalyDetected).toBe(false);
      expect(json.forced).toBe(false);

      expect(mockStartDailyCloseRun).toHaveBeenCalledWith(expect.anything(), '2026-01-15', false);
      expect(mockGenerateDailyReport).toHaveBeenCalled();
      expect(mockGenerateStripeEvidence).toHaveBeenCalled();
      expect(mockRenderDailyCloseHtml).toHaveBeenCalledWith(sampleReport, sampleEvidence);
      expect(mockPutJson).toHaveBeenCalledTimes(2);
      expect(mockPutText).toHaveBeenCalledTimes(1);
      expect(mockUpsertDocument).toHaveBeenCalledTimes(3);
      expect(mockCompleteDailyCloseRun).toHaveBeenCalledWith(expect.anything(), 42, {
        status: 'success',
        artifactsGenerated: 3,
        ledgerEntriesCreated: 4,
        anomalyDetected: false,
      });
    });

    it('regenerates with force=true', async () => {
      setupSuccessfulRun();

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/artifacts?force=true', { method: 'POST' });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.forced).toBe(true);
      expect(mockStartDailyCloseRun).toHaveBeenCalledWith(expect.anything(), '2026-01-15', true);
    });

    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();
      const res = await fetch('/daily-close/bad-date/artifacts', { method: 'POST' });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid date');
    });

    it('returns 500 when run fails', async () => {
      mockStartDailyCloseRun.mockResolvedValue(43);
      mockGenerateDailyReport.mockRejectedValue(new Error('DB connection lost'));
      mockCompleteDailyCloseRun.mockResolvedValue(undefined);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toBeDefined();
      expect(mockCompleteDailyCloseRun).toHaveBeenCalledWith(expect.anything(), 43, {
        status: 'failed',
        errorMessage: 'DB connection lost',
      });
    });

    it('detects anomalies and reports them', async () => {
      setupSuccessfulRun();
      mockEnqueueDailyCloseAnomaly.mockResolvedValue(true);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.anomalyDetected).toBe(true);
    });
  });

  describe('GET /daily-close/:date/documents', () => {
    it('returns documents list', async () => {
      const documents = [
        { id: 1, path: 'daily-close/2026-01-15/report.json', content_type: 'application/json' },
        { id: 2, path: 'daily-close/2026-01-15/report.html', content_type: 'text/html' },
      ];
      mockListDocuments.mockResolvedValueOnce(documents);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/documents');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.documents).toHaveLength(2);
      expect(json.documents[0].path).toContain('report.json');
      expect(mockListDocuments).toHaveBeenCalledWith(expect.anything(), 'daily_close', '2026-01-15');
    });

    it('returns empty array when no documents exist', async () => {
      mockListDocuments.mockResolvedValueOnce([]);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/documents');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.documents).toHaveLength(0);
    });

    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();
      const res = await fetch('/daily-close/not-valid/documents');
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid date');
    });

    it('returns 500 when service throws', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB error'));

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/documents');
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch documents');
    });
  });

  describe('GET /daily-close/:date/status', () => {
    it('returns run status when exists', async () => {
      const run = {
        id: 42,
        date: '2026-01-15',
        status: 'success',
        started_at: '2026-01-15T23:00:00Z',
        completed_at: '2026-01-15T23:01:00Z',
        error_message: null,
        artifacts_generated: 3,
        ledger_entries_created: 4,
        anomaly_detected: 0,
        forced: 0,
        created_at: '2026-01-15T23:00:00Z',
        updated_at: '2026-01-15T23:01:00Z',
      };
      mockGetLatestRunForDate.mockResolvedValueOnce(run);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/status');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.date).toBe('2026-01-15');
      expect(json.run.id).toBe(42);
      expect(json.run.status).toBe('success');
      expect(mockGetLatestRunForDate).toHaveBeenCalledWith(expect.anything(), '2026-01-15');
    });

    it('returns null run when no run exists', async () => {
      mockGetLatestRunForDate.mockResolvedValueOnce(null);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/status');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.date).toBe('2026-01-15');
      expect(json.run).toBeNull();
    });

    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();
      const res = await fetch('/daily-close/abc/status');
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid date');
    });

    it('returns 500 when service throws', async () => {
      mockGetLatestRunForDate.mockRejectedValueOnce(new Error('DB error'));

      const { fetch } = createApp();
      const res = await fetch('/daily-close/2026-01-15/status');
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch run status');
    });
  });

  describe('GET /daily-close/runs', () => {
    it('returns paginated list of runs', async () => {
      const runs = [
        { id: 42, date: '2026-01-15', status: 'success', artifacts_generated: 3 },
        { id: 41, date: '2026-01-14', status: 'success', artifacts_generated: 3 },
      ];
      mockListDailyCloseRuns.mockResolvedValueOnce(runs);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/runs');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.runs).toHaveLength(2);
      expect(mockListDailyCloseRuns).toHaveBeenCalledWith(expect.anything(), { limit: 20, offset: 0 });
    });

    it('respects limit and offset parameters', async () => {
      mockListDailyCloseRuns.mockResolvedValueOnce([]);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/runs?limit=5&offset=10');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockListDailyCloseRuns).toHaveBeenCalledWith(expect.anything(), { limit: 5, offset: 10 });
    });

    it('returns empty array when no runs exist', async () => {
      mockListDailyCloseRuns.mockResolvedValueOnce([]);

      const { fetch } = createApp();
      const res = await fetch('/daily-close/runs');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.runs).toHaveLength(0);
    });

    it('returns 500 when service throws', async () => {
      mockListDailyCloseRuns.mockRejectedValueOnce(new Error('DB error'));

      const { fetch } = createApp();
      const res = await fetch('/daily-close/runs');
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch runs');
    });
  });
});
