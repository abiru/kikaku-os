import type { Env } from '../env';

export type CompanyInfo = {
  name: string;
  postal_code: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string | null;
};

export const getCompanyInfo = (env: Env['Bindings']): CompanyInfo => ({
  name: env.COMPANY_NAME || '株式会社LED企画',
  postal_code: env.COMPANY_POSTAL_CODE || '',
  address: env.COMPANY_ADDRESS || '',
  phone: env.COMPANY_PHONE || '',
  email: env.COMPANY_EMAIL || '',
  logo_url: env.COMPANY_LOGO_URL || null
});
