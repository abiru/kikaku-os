import type { Env } from '../env';
import { getCompanyInfoFromSettings } from '../services/settings';

export type CompanyInfo = {
  name: string;
  postal_code: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string | null;
};

export const getCompanyInfo = async (env: Env['Bindings']): Promise<CompanyInfo> => {
  try {
    return await getCompanyInfoFromSettings(env);
  } catch (error) {
    console.error('Failed to get company info from settings, using env fallback:', error);
    // Fallback to environment variables (legacy support)
    return {
      name: env.COMPANY_NAME || '株式会社LED企画',
      postal_code: env.COMPANY_POSTAL_CODE || '',
      address: env.COMPANY_ADDRESS || '',
      phone: env.COMPANY_PHONE || '',
      email: env.COMPANY_EMAIL || '',
      logo_url: env.COMPANY_LOGO_URL || null
    };
  }
};
