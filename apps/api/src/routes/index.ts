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
import adminHomeHeroes from './admin/adminHomeHeroes';
import adminOrders from './admin/adminOrders';
import adminPages from './admin/adminPages';
import adminProductImages from './admin/adminProductImages';
import adminProducts from './admin/adminProducts';
import adminReports from './admin/adminReports';
import adminSettings from './admin/adminSettings';
import adminStripeEvents from './admin/adminStripeEvents';
import adminTaxRates from './admin/adminTaxRates';
import adminProductFetch from './admin/adminProductFetch';
import adminUsers from './admin/adminUsers';
import adminInquiries from './admin/adminInquiries';
import adminReviews from './admin/adminReviews';
import adminNewsletter from './admin/adminNewsletter';
import adminOrderExport from './admin/adminOrderExport';

// Webhooks
import stripe from './webhooks/stripe';

// Storefront
import storefront from './storefront/storefront';
import storeAccount from './storefront/storeAccount';
import contact from './storefront/contact';
import storeReviews from './storefront/reviews';
import storeNewsletter from './storefront/newsletter';

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
  // adminOrderExport must be registered before adminOrders to avoid :id param capturing "export"
  app.route('/admin', adminOrderExport);
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
  app.route('/admin', adminHomeHeroes);
  app.route('/admin', adminProductFetch);
  app.route('/admin', adminUsers);
  app.route('/admin', adminInquiries);
  app.route('/admin', adminReviews);
  app.route('/admin/newsletter', adminNewsletter);

  // Webhooks (public, signature-verified)
  app.route('/', stripe);

  // Storefront (public)
  app.route('/store', storefront);
  // Customer account (requires Clerk auth)
  app.route('/store/account', storeAccount);
  app.route('/store', contact);
  app.route('/store', storeReviews);
  app.route('/store', storeNewsletter);

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
  adminHomeHeroes,
  adminOrders,
  adminPages,
  adminProductImages,
  adminProducts,
  adminReports,
  adminSettings,
  adminStripeEvents,
  adminTaxRates,
  adminProductFetch,
  adminUsers,
  adminInquiries,
  adminReviews,
  adminNewsletter,
  adminOrderExport,
  // Webhooks
  stripe,
  // Storefront
  storefront,
  storeAccount,
  contact,
  storeReviews,
  storeNewsletter,
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
