-- Drop redundant indexes that duplicate UNIQUE constraints
-- SQLite automatically creates an internal index for UNIQUE constraints,
-- making these explicit indexes redundant.

-- app_settings.key: has UNIQUE constraint, redundant normal + unique indexes
DROP INDEX IF EXISTS idx_app_settings_key;
DROP INDEX IF EXISTS idx_app_settings_key_unique;

-- coupons.code: has UNIQUE constraint (0015_coupons.sql), redundant unique index
DROP INDEX IF EXISTS idx_coupons_code;

-- static_pages.slug: has UNIQUE constraint, redundant normal index
DROP INDEX IF EXISTS idx_static_pages_slug;

-- newsletter_subscribers.email: has UNIQUE constraint, redundant normal index
DROP INDEX IF EXISTS idx_newsletter_subscribers_email;
