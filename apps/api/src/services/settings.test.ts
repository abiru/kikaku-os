import { describe, it, expect, beforeEach } from 'vitest';
import { getSetting, getSettingInt, getSettingBool, getAllSettings, getCompanyInfoFromSettings, getShippingSettings } from './settings';

describe('Settings Service', () => {
  const mockEnv = {
    DB: {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (query.includes('app_settings') && query.includes('WHERE key')) {
              const key = args[0];
              if (key === 'shipping_fee_amount') return { value: '600' };
              if (key === 'free_shipping_threshold') return { value: '6000' };
              if (key === 'company_name') return { value: 'Test Company' };
              if (key === 'maintenance_mode') return { value: 'true' };
              return null;
            }
            return null;
          },
          all: async () => {
            if (query.includes('app_settings')) {
              return {
                results: [
                  { key: 'shipping_fee_amount', value: '600', category: 'shipping', data_type: 'integer', description: '送料' },
                  { key: 'free_shipping_threshold', value: '6000', category: 'shipping', data_type: 'integer', description: '送料無料閾値' },
                  { key: 'company_name', value: 'Test Company', category: 'company', data_type: 'string', description: '会社名' }
                ]
              };
            }
            return { results: [] };
          }
        })
      })
    },
    SHIPPING_FEE_AMOUNT: '500',
    FREE_SHIPPING_THRESHOLD: '5000',
    COMPANY_NAME: 'Fallback Company'
  } as any;

  describe('getSetting', () => {
    it('returns value from database when available', async () => {
      const value = await getSetting(mockEnv, 'shipping_fee_amount');
      expect(value).toBe('600');
    });

    it('returns fallback when database returns null', async () => {
      const value = await getSetting(mockEnv, 'nonexistent_key', 'default_value');
      expect(value).toBe('default_value');
    });

    it('returns environment variable when database returns null and no fallback', async () => {
      const value = await getSetting(mockEnv, 'company_name');
      expect(value).toBe('Test Company');
    });
  });

  describe('getSettingInt', () => {
    it('returns integer value from database', async () => {
      const value = await getSettingInt(mockEnv, 'shipping_fee_amount', 500);
      expect(value).toBe(600);
    });

    it('returns fallback for invalid integer', async () => {
      const value = await getSettingInt(mockEnv, 'nonexistent_key', 999);
      expect(value).toBe(999);
    });
  });

  describe('getSettingBool', () => {
    it('returns true for "true" value', async () => {
      const value = await getSettingBool(mockEnv, 'maintenance_mode', false);
      expect(value).toBe(true);
    });

    it('returns fallback for null value', async () => {
      const value = await getSettingBool(mockEnv, 'nonexistent_key', false);
      expect(value).toBe(false);
    });
  });

  describe('getAllSettings', () => {
    it('returns settings grouped by category', async () => {
      const settings = await getAllSettings(mockEnv);
      expect(settings).toHaveProperty('shipping');
      expect(settings).toHaveProperty('company');
      expect(settings.shipping).toHaveLength(2);
      expect(settings.company).toHaveLength(1);
    });
  });

  describe('getCompanyInfoFromSettings', () => {
    it('returns company info from database', async () => {
      const info = await getCompanyInfoFromSettings(mockEnv);
      expect(info.name).toBe('Test Company');
      expect(info).toHaveProperty('postal_code');
      expect(info).toHaveProperty('address');
      expect(info).toHaveProperty('phone');
      expect(info).toHaveProperty('email');
      expect(info).toHaveProperty('logo_url');
    });
  });

  describe('getShippingSettings', () => {
    it('returns shipping settings from database', async () => {
      const settings = await getShippingSettings(mockEnv);
      expect(settings.shippingFee).toBe(600);
      expect(settings.freeShippingThreshold).toBe(6000);
    });
  });
});
