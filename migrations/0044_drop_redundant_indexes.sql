-- Drop redundant indexes on columns that already have UNIQUE constraints.
-- SQLite creates an implicit index for UNIQUE columns, so these are duplicates.

-- app_settings.key: UNIQUE column + idx_app_settings_key + idx_app_settings_key_unique
DROP INDEX IF EXISTS idx_app_settings_key;
DROP INDEX IF EXISTS idx_app_settings_key_unique;

-- coupons.code: UNIQUE column + idx_coupons_code UNIQUE INDEX
DROP INDEX IF EXISTS idx_coupons_code;

-- static_pages.slug: UNIQUE column + idx_static_pages_slug
DROP INDEX IF EXISTS idx_static_pages_slug;

-- newsletter_subscribers.email: UNIQUE column + idx_newsletter_subscribers_email
DROP INDEX IF EXISTS idx_newsletter_subscribers_email;
