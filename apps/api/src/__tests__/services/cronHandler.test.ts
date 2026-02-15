import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('../../services/dailyReport', () => ({
  generateDailyReport: vi.fn().mockResolvedValue({
    date: '2025-01-14',
    totalSales: 50000,
    orderCount: 5,
    refundCount: 0,
    refundTotal: 0,
    netSales: 50000
  })
}));

vi.mock('../../services/stripeEvidence', () => ({
  generateStripeEvidence: vi.fn().mockResolvedValue({
    date: '2025-01-14',
    events: []
  })
}));

vi.mock('../../services/renderDailyCloseHtml', () => ({
  renderDailyCloseHtml: vi.fn().mockReturnValue('<html>report</html>')
}));

vi.mock('../../lib/r2', () => ({
  putJson: vi.fn().mockResolvedValue(undefined),
  putText: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/documents', () => ({
  upsertDocument: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/journalize', () => ({
  journalizeDailyClose: vi.fn().mockResolvedValue({ entriesCreated: 4 })
}));

vi.mock('../../services/inboxAnomalies', () => ({
  enqueueDailyCloseAnomaly: vi.fn().mockResolvedValue(false)
}));

vi.mock('../../services/dailyCloseRuns', () => ({
  startDailyCloseRun: vi.fn().mockResolvedValue(1),
  completeDailyCloseRun: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/anomalyRules', () => ({
  runAllAnomalyChecks: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/inventoryAlerts', () => ({
  checkInventoryAlerts: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../lib/date', () => ({
  jstYesterdayStringFromMs: vi.fn().mockReturnValue('2025-01-14')
}));

vi.mock('../../lib/alerts', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../lib/sentry', () => ({
  captureException: vi.fn(),
  getSentryConfig: vi.fn().mockReturnValue(null)
}));

vi.mock('@sentry/cloudflare', () => ({
  withSentry: vi.fn((_getConfig, handler) => handler),
  withMonitor: vi.fn((_name, fn) => fn())
}));

vi.mock('../../services/orderEmail', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendBankTransferInstructionsEmail: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../middleware/clerkAuth', () => ({
  clerkAuth: vi.fn(async (_c: any, next: any) => next())
}));

vi.mock('../../services/inventoryCheck', () => ({
  consumeStockReservationForOrder: vi.fn().mockResolvedValue(false),
  deductStockForOrder: vi.fn().mockResolvedValue(undefined),
  releaseStockReservationForOrder: vi.fn().mockResolvedValue(undefined)
}));

import { startDailyCloseRun, completeDailyCloseRun } from '../../services/dailyCloseRuns';
import { generateDailyReport } from '../../services/dailyReport';
import { generateStripeEvidence } from '../../services/stripeEvidence';
import { putJson, putText } from '../../lib/r2';
import { upsertDocument } from '../../services/documents';
import { journalizeDailyClose } from '../../services/journalize';
import { enqueueDailyCloseAnomaly } from '../../services/inboxAnomalies';
import { runAllAnomalyChecks } from '../../services/anomalyRules';
import { checkInventoryAlerts } from '../../services/inventoryAlerts';
import { sendAlert } from '../../lib/alerts';

describe('cron handler - scheduled', () => {
  let workerDefault: any;
  let mockEnv: any;
  let waitUntilPromises: Promise<unknown>[];

  beforeEach(async () => {
    vi.clearAllMocks();
    waitUntilPromises = [];

    // Import the worker module fresh (uses mocked dependencies)
    const mod = await import('../../index');
    workerDefault = mod.default;

    const mockDbRun = vi.fn().mockResolvedValue({ success: true });
    mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            run: mockDbRun,
            all: vi.fn().mockResolvedValue({ results: [] })
          }),
          run: mockDbRun
        })
      },
      R2: {},
      DEV_MODE: 'false',
      ADMIN_API_KEY: 'test-key',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    };
  });

  it('invokes scheduled handler without error', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    // The scheduled handler should exist
    expect(workerDefault.scheduled).toBeDefined();

    await workerDefault.scheduled(controller, mockEnv, ctx);

    // Wait for all waitUntil promises
    await Promise.allSettled(waitUntilPromises);

    // Verify daily close pipeline was called
    expect(startDailyCloseRun).toHaveBeenCalledWith(mockEnv, '2025-01-14', false);
  });

  it('calls daily report generation', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(generateDailyReport).toHaveBeenCalledWith(mockEnv, '2025-01-14');
    expect(generateStripeEvidence).toHaveBeenCalledWith(mockEnv, '2025-01-14');
  });

  it('stores artifacts in R2', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(putJson).toHaveBeenCalledWith(
      mockEnv.R2,
      'daily-close/2025-01-14/report.json',
      expect.any(Object)
    );
    expect(putJson).toHaveBeenCalledWith(
      mockEnv.R2,
      'daily-close/2025-01-14/stripe-evidence.json',
      expect.any(Object)
    );
    expect(putText).toHaveBeenCalledWith(
      mockEnv.R2,
      'daily-close/2025-01-14/report.html',
      '<html>report</html>',
      'text/html; charset=utf-8'
    );
  });

  it('upserts document records', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(upsertDocument).toHaveBeenCalledTimes(3);
  });

  it('runs journalization', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(journalizeDailyClose).toHaveBeenCalledWith(
      mockEnv,
      '2025-01-14',
      expect.any(Object)
    );
  });

  it('checks for anomalies', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(enqueueDailyCloseAnomaly).toHaveBeenCalled();
  });

  it('runs inventory alerts', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(checkInventoryAlerts).toHaveBeenCalledWith(mockEnv, '2025-01-14');
  });

  it('completes run with success on successful execution', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(completeDailyCloseRun).toHaveBeenCalledWith(
      mockEnv,
      1,
      expect.objectContaining({
        status: 'success',
        artifactsGenerated: 3,
        ledgerEntriesCreated: 4
      })
    );
  });

  it('completes run with failed status on error and sends alert', async () => {
    vi.mocked(generateDailyReport).mockRejectedValueOnce(
      new Error('Report generation failed')
    );

    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(completeDailyCloseRun).toHaveBeenCalledWith(
      mockEnv,
      1,
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'Report generation failed'
      })
    );

    expect(sendAlert).toHaveBeenCalledWith(
      mockEnv,
      'critical',
      expect.stringContaining('Daily close failed'),
      expect.objectContaining({ error: 'Report generation failed' })
    );
  });

  it('runs cleanup tasks (expired quotes and stale orders)', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    // Cleanup tasks should be called via waitUntil
    const prepareCalls = mockEnv.DB.prepare.mock.calls.map(
      (c: any[]) => c[0]
    );
    const hasExpiredQuotesCleanup = prepareCalls.some(
      (sql: string) => sql.includes('DELETE FROM checkout_quotes') && sql.includes('expires_at')
    );
    const hasStaleOrdersCleanup = prepareCalls.some(
      (sql: string) => sql.includes('UPDATE orders') && sql.includes("status = 'cancelled'")
    );

    expect(hasExpiredQuotesCleanup).toBe(true);
    expect(hasStaleOrdersCleanup).toBe(true);
  });

  it('runs anomaly checks in parallel', async () => {
    const controller = { scheduledTime: Date.now(), cron: '0 16 * * *' };
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: vi.fn()
    };

    await workerDefault.scheduled(controller, mockEnv, ctx);
    await Promise.allSettled(waitUntilPromises);

    expect(runAllAnomalyChecks).toHaveBeenCalledWith(mockEnv, '2025-01-14');
  });
});
