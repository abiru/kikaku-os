import type { Env } from '../env';

type SettingValue = {
  value: string;
  data_type: string;
};

/**
 * Get a setting value from database, with environment variable fallback
 */
export async function getSetting(
  env: Env['Bindings'],
  key: string,
  fallback?: string
): Promise<string | null> {
  try {
    const result = await env.DB.prepare(
      'SELECT value FROM app_settings WHERE key = ? AND is_active = 1'
    )
      .bind(key)
      .first<SettingValue>();

    if (result) {
      return result.value;
    }

    // Fallback to environment variable (legacy compatibility)
    const envKey = key.toUpperCase();
    const envValue = (env as any)[envKey];
    if (envValue !== undefined) {
      return String(envValue);
    }

    return fallback || null;
  } catch (error) {
    console.error(`Failed to get setting ${key}:`, error);
    return fallback || null;
  }
}

/**
 * Get setting as integer with fallback
 */
export async function getSettingInt(
  env: Env['Bindings'],
  key: string,
  fallback: number
): Promise<number> {
  const value = await getSetting(env, key);
  if (value === null) return fallback;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Get setting as boolean with fallback
 */
export async function getSettingBool(
  env: Env['Bindings'],
  key: string,
  fallback: boolean
): Promise<boolean> {
  const value = await getSetting(env, key);
  if (value === null) return fallback;

  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

/**
 * Get all settings grouped by category
 */
export async function getAllSettings(env: Env['Bindings']): Promise<Record<string, any[]>> {
  try {
    const result = await env.DB.prepare(
      `SELECT key, value, category, data_type, description
       FROM app_settings
       WHERE is_active = 1
       ORDER BY category ASC, display_order ASC`
    ).all();

    const settings = result.results || [];

    return settings.reduce((acc: Record<string, any[]>, setting: any) => {
      const category = setting.category || 'general';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(setting);
      return acc;
    }, {});
  } catch (error) {
    console.error('Failed to get all settings:', error);
    return {};
  }
}

/**
 * Get company information from settings with env fallback
 */
export async function getCompanyInfoFromSettings(env: Env['Bindings']) {
  const logoUrl = await getSetting(env, 'company_logo_url', '');
  return {
    name: (await getSetting(env, 'company_name', '株式会社LED企画')) || '株式会社LED企画',
    postal_code: (await getSetting(env, 'company_postal_code', '')) || '',
    address: (await getSetting(env, 'company_address', '')) || '',
    phone: (await getSetting(env, 'company_phone', '')) || '',
    email: (await getSetting(env, 'company_email', '')) || '',
    logo_url: logoUrl || null,
  };
}

/**
 * Get shipping settings with env fallback
 */
export async function getShippingSettings(env: Env['Bindings']) {
  return {
    shippingFee: await getSettingInt(env, 'shipping_fee_amount', 500),
    freeShippingThreshold: await getSettingInt(env, 'free_shipping_threshold', 5000),
  };
}
