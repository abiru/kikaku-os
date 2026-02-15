import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import dailyCloseArtifacts from '../../../routes/accounting/dailyCloseArtifacts';
import type { DailyReport } from '../../../services/dailyReport';
import type { StripeEvidence } from '../../../services/stripeEvidence';

// Mock services
vi.mock('../../../services/dailyReport', () => ({
  generateDailyReport: vi.fn()
}));
vi.mock('../../../services/stripeEvidence', () => ({
  generateStripeEvidence: vi.fn()
}));
vi.mock('../../../services/renderDailyCloseHtml', () => ({
  renderDailyCloseHtml: vi.fn()
}));
vi.mock('../../../services/journalize', () => ({
  journalizeDailyClose: vi.fn()
}));
vi.mock('../../../services/inboxAnomalies', () => ({
  enqueueDailyCloseAnomaly: vi.fn()
}));
vi.mock('../../../services/documents', () => ({
  listDocuments: vi.fn(),
  upsertDocument: vi.fn()
}));
vi.mock('../../../services/dailyCloseRuns', () => ({
  startDailyCloseRun: vi.fn(),
  completeDailyCloseRun: vi.fn(),
  getLatestRunForDate: vi.fn(),
  listDailyCloseRuns: vi.fn()
}));
vi.mock('../../../lib/r2', () => ({
  putJson: vi.fn(),
  putText: vi.fn()
}));

import { generateDailyReport } from '../../../services/dailyReport';
import { generateStripeEvidence } from '../../../services/stripeEvidence';
import { renderDailyCloseHtml } from '../../../services/renderDailyCloseHtml';
import { journalizeDailyClose } from '../../../services/journalize';
import { enqueueDailyCloseAnomaly } from '../../../services/inboxAnomalies';
import { listDocuments, upsertDocument } from '../../../services/documents';
import {
  startDailyCloseRun,
  completeDailyCloseRun,
  getLatestRunForDate,
  listDailyCloseRuns
} from '../../../services/dailyCloseRuns';
import { putJson, putText } from '../../../lib/r2';

const mockReport: DailyReport = {
  date: '2026-01-15',
  orders: { count: 5, totalNet: 25000, totalFee: 750 },
  payments: { count: 5, totalAmount: 25000, totalFee: 750 },
  refunds: { count: 0, totalAmount: 0 },
  anomalies: { level: 'ok', diff: 0, message: 'OK diff: 0' }
};

const mockEvidence: StripeEvidence = {
  payments: [{ id: 1, amount: 5000, fee: 150, created_at: '2026-01-15T10:00:00Z', method: 'card', provider: 'stripe' }],
  refunds: []
};

const createMockR2 = () => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn()
});

const createMockDb = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      first: vi.fn(async () => null),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ success: true, meta: { last_row_id: 1, changes: 1 } }))
    }))
  }))
});

const createApp = () => {
  const app = new Hono();
  app.route('/', dailyCloseArtifacts);
  const mockDb = createMockDb();
  const mockR2 = createMockR2();
  const env = { DB: mockDb, R2: mockR2 };
  return {
    app,
    env,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, env as any)
  };
};

describe('Daily Close Artifacts Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startDailyCloseRun).mockResolvedValue(1);
    vi.mocked(generateDailyReport).mockResolvedValue(mockReport);
    vi.mocked(generateStripeEvidence).mockResolvedValue(mockEvidence);
    vi.mocked(renderDailyCloseHtml).mockReturnValue('<html>Report</html>');
    vi.mocked(journalizeDailyClose).mockResolvedValue({ entriesCreated: 4, skipped: false });
    vi.mocked(enqueueDailyCloseAnomaly).mockResolvedValue(false);
    vi.mocked(upsertDocument).mockResolvedValue(undefined);
    vi.mocked(completeDailyCloseRun).mockResolvedValue(undefined);
    vi.mocked(putJson).mockResolvedValue(undefined);
    vi.mocked(putText).mockResolvedValue(undefined);
  });

  describe('POST /daily-close/:date/artifacts', () => {
    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/not-a-date/artifacts', { method: 'POST' });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('completes full daily close flow successfully', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.date).toBe('2026-01-15');
      expect(json.runId).toBe(1);
      expect(json.keys.reportKey).toBe('daily-close/2026-01-15/report.json');
      expect(json.keys.evidenceKey).toBe('daily-close/2026-01-15/stripe-evidence.json');
      expect(json.keys.htmlKey).toBe('daily-close/2026-01-15/report.html');
      expect(json.ledgerEntriesCreated).toBe(4);
      expect(json.anomalyDetected).toBe(false);
    });

    it('calls services in correct order: report → R2 save → ledger → anomaly', async () => {
      const { fetch } = createApp();
      const callOrder: string[] = [];

      vi.mocked(startDailyCloseRun).mockImplementation(async () => {
        callOrder.push('startRun');
        return 1;
      });
      vi.mocked(generateDailyReport).mockImplementation(async () => {
        callOrder.push('generateReport');
        return mockReport;
      });
      vi.mocked(generateStripeEvidence).mockImplementation(async () => {
        callOrder.push('generateEvidence');
        return mockEvidence;
      });
      vi.mocked(renderDailyCloseHtml).mockImplementation(() => {
        callOrder.push('renderHtml');
        return '<html>Report</html>';
      });
      vi.mocked(putJson).mockImplementation(async () => {
        callOrder.push('putJson');
      });
      vi.mocked(putText).mockImplementation(async () => {
        callOrder.push('putText');
      });
      vi.mocked(upsertDocument).mockImplementation(async () => {
        callOrder.push('upsertDocument');
      });
      vi.mocked(journalizeDailyClose).mockImplementation(async () => {
        callOrder.push('journalize');
        return { entriesCreated: 4, skipped: false };
      });
      vi.mocked(enqueueDailyCloseAnomaly).mockImplementation(async () => {
        callOrder.push('anomaly');
        return false;
      });
      vi.mocked(completeDailyCloseRun).mockImplementation(async () => {
        callOrder.push('completeRun');
      });

      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });
      expect(res.status).toBe(200);

      expect(callOrder.indexOf('startRun')).toBeLessThan(callOrder.indexOf('generateReport'));
      expect(callOrder.indexOf('generateReport')).toBeLessThan(callOrder.indexOf('putJson'));
      expect(callOrder.indexOf('putJson')).toBeLessThan(callOrder.indexOf('journalize'));
      expect(callOrder.indexOf('journalize')).toBeLessThan(callOrder.indexOf('anomaly'));
      expect(callOrder.indexOf('anomaly')).toBeLessThan(callOrder.indexOf('completeRun'));
    });

    it('saves report, evidence, and HTML to R2', async () => {
      const { fetch } = createApp();

      await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });

      expect(putJson).toHaveBeenCalledWith(
        expect.anything(),
        'daily-close/2026-01-15/report.json',
        mockReport
      );
      expect(putJson).toHaveBeenCalledWith(
        expect.anything(),
        'daily-close/2026-01-15/stripe-evidence.json',
        mockEvidence
      );
      expect(putText).toHaveBeenCalledWith(
        expect.anything(),
        'daily-close/2026-01-15/report.html',
        '<html>Report</html>',
        'text/html; charset=utf-8'
      );
    });

    it('creates ledger entries via journalize service', async () => {
      const { fetch } = createApp();

      await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });

      expect(journalizeDailyClose).toHaveBeenCalledWith(
        expect.anything(),
        '2026-01-15',
        mockReport,
        { force: false }
      );
    });

    it('checks for anomalies and creates inbox items when detected', async () => {
      const warningReport: DailyReport = {
        ...mockReport,
        anomalies: { level: 'warning', diff: 5000, message: 'WARNING diff: 5000' }
      };
      vi.mocked(generateDailyReport).mockResolvedValue(warningReport);
      vi.mocked(enqueueDailyCloseAnomaly).mockResolvedValue(true);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.anomalyDetected).toBe(true);
      expect(enqueueDailyCloseAnomaly).toHaveBeenCalledWith(
        expect.anything(),
        warningReport,
        {
          reportKey: 'daily-close/2026-01-15/report.json',
          htmlKey: 'daily-close/2026-01-15/report.html'
        }
      );
    });

    it('records run completion on success', async () => {
      const { fetch } = createApp();

      await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });

      expect(completeDailyCloseRun).toHaveBeenCalledWith(
        expect.anything(),
        1,
        {
          status: 'success',
          artifactsGenerated: 3,
          ledgerEntriesCreated: 4,
          anomalyDetected: false
        }
      );
    });

    it('handles report generation failure gracefully', async () => {
      vi.mocked(generateDailyReport).mockRejectedValue(new Error('DB connection failed'));

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.ok).toBe(false);

      expect(completeDailyCloseRun).toHaveBeenCalledWith(
        expect.anything(),
        1,
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'DB connection failed'
        })
      );
    });

    it('passes force flag to journalize when force=true', async () => {
      const { fetch } = createApp();

      await fetch('/daily-close/2026-01-15/artifacts?force=true', { method: 'POST' });

      expect(journalizeDailyClose).toHaveBeenCalledWith(
        expect.anything(),
        '2026-01-15',
        mockReport,
        { force: true }
      );
    });

    it('upserts documents for each artifact', async () => {
      const { fetch } = createApp();

      await fetch('/daily-close/2026-01-15/artifacts', { method: 'POST' });

      expect(upsertDocument).toHaveBeenCalledTimes(3);
      expect(upsertDocument).toHaveBeenCalledWith(
        expect.anything(),
        'daily_close',
        '2026-01-15',
        'daily-close/2026-01-15/report.json',
        'application/json'
      );
      expect(upsertDocument).toHaveBeenCalledWith(
        expect.anything(),
        'daily_close',
        '2026-01-15',
        'daily-close/2026-01-15/report.html',
        'text/html'
      );
    });
  });

  describe('GET /daily-close/:date/documents', () => {
    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/invalid/documents');
      expect(res.status).toBe(400);
    });

    it('returns documents for valid date', async () => {
      const docs = [
        { id: 1, ref_type: 'daily_close', ref_id: '2026-01-15', path: 'daily-close/2026-01-15/report.json' }
      ];
      vi.mocked(listDocuments).mockResolvedValue(docs as any);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-15/documents');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.documents).toHaveLength(1);
    });
  });

  describe('GET /daily-close/:date/status', () => {
    it('returns 400 for invalid date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/daily-close/bad/status');
      expect(res.status).toBe(400);
    });

    it('returns run status for valid date', async () => {
      vi.mocked(getLatestRunForDate).mockResolvedValue({
        id: 1,
        date: '2026-01-15',
        status: 'success',
        started_at: '2026-01-15T00:00:00Z',
        completed_at: '2026-01-15T00:01:00Z',
        artifacts_generated: 3,
        ledger_entries_created: 4,
        anomaly_detected: 0,
        forced: 0,
        error_message: null
      } as any);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-15/status');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.run.status).toBe('success');
    });

    it('returns null run when no run exists', async () => {
      vi.mocked(getLatestRunForDate).mockResolvedValue(null);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/2026-01-15/status');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.run).toBeNull();
    });
  });

  describe('GET /daily-close/runs', () => {
    it('returns list of runs', async () => {
      const runs = [
        { id: 1, date: '2026-01-15', status: 'success' },
        { id: 2, date: '2026-01-14', status: 'success' }
      ];
      vi.mocked(listDailyCloseRuns).mockResolvedValue(runs as any);

      const { fetch } = createApp();

      const res = await fetch('/daily-close/runs');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.runs).toHaveLength(2);
    });
  });
});
