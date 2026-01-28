import type { Hono } from 'hono';
import type { Env } from '../env';

// Admin routes
import adminAds from './admin/adminAds';
import adminAnalytics from './admin/adminAnalytics';
import adminBulkImageUpload from './admin/adminBulkImageUpload';
import adminCategories from './admin/adminCategories';
import adminCoupons from './admin/adminCoupons';
import adminCustomers from './admin/adminCustomers';
import adminEmailTemplates from './admin/adminEmailTemplates';
import adminOrders from './admin/adminOrders';
import adminPages from './admin/adminPages';
import adminProductImages from './admin/adminProductImages';
import adminProducts from './admin/adminProducts';
import adminReports from './admin/adminReports';
import adminSettings from './admin/adminSettings';
import adminStripeEvents from './admin/adminStripeEvents';
import adminTaxRates from './admin/adminTaxRates';

// Webhooks
import stripe from './webhooks/stripe';

// Storefront
import storefront from './storefront/storefront';

// Checkout
import checkout from './checkout/checkout';
import payments from './checkout/payments';
import quotations from './checkout/quotations';

// Accounting
import accounting from './accounting/accounting';
import reports from './accounting/reports';
import dailyCloseArtifacts from './accounting/dailyCloseArtifacts';

// Operations
import fulfillments from './operations/fulfillments';
import inventory from './operations/inventory';
import ai from './operations/ai';

// AI Automation
import aiContent from './ai/aiContent';
import aiWorkflows from './ai/aiWorkflows';

// System
import inbox from './system/inbox';
import dev from './system/dev';
import health from './health';

/**
 * Register all routes to the Hono app instance.
 * Organized by domain for better maintainability.
 */
export function registerRoutes(app: Hono<Env>) {
  // Health check (public, unauthenticated)
  app.route('/', health);
  // Admin routes (requires Clerk auth via middleware)
  app.route('/', adminOrders);
  app.route('/admin', adminProducts);
  app.route('/admin', adminReports);
  app.route('/admin', adminStripeEvents);
  app.route('/admin', adminCustomers);
  app.route('/admin', adminProductImages);
  app.route('/admin/bulk-image-upload', adminBulkImageUpload);
  app.route('/admin', adminCategories);
  app.route('/admin', adminCoupons);
  app.route('/admin', adminPages);
  app.route('/admin', adminEmailTemplates);
  app.route('/admin', adminAnalytics);
  app.route('/admin/tax-rates', adminTaxRates);
  app.route('/admin/ads', adminAds);
  app.route('/admin/settings', adminSettings);

  // Webhooks (public, signature-verified)
  app.route('/', stripe);

  // Storefront (public)
  app.route('/store', storefront);

  // Checkout & Payments (public + authenticated)
  app.route('/', checkout);
  app.route('/', payments);
  app.route('/', quotations);

  // Accounting & Reports
  app.route('/reports', reports);
  app.route('/', accounting);
  app.route('/', dailyCloseArtifacts);

  // Operations
  app.route('/', fulfillments);
  app.route('/', inventory);
  app.route('/ai', ai);

  // AI Automation
  app.route('/ai', aiContent);
  app.route('/ai', aiWorkflows);

  // System
  app.route('/', inbox);
  app.route('/dev', dev);
}

// Re-export for backwards compatibility if needed
export {
  // Admin
  adminAds,
  adminAnalytics,
  adminBulkImageUpload,
  adminCategories,
  adminCoupons,
  adminCustomers,
  adminEmailTemplates,
  adminOrders,
  adminPages,
  adminProductImages,
  adminProducts,
  adminReports,
  adminSettings,
  adminStripeEvents,
  adminTaxRates,
  // Webhooks
  stripe,
  // Storefront
  storefront,
  // Checkout
  checkout,
  payments,
  quotations,
  // Accounting
  accounting,
  reports,
  dailyCloseArtifacts,
  // Operations
  fulfillments,
  inventory,
  ai,
  // AI Automation
  aiContent,
  aiWorkflows,
  // System
  inbox,
  dev
};
