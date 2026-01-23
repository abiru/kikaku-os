import { z } from 'zod';

// === App Settings Schemas ===

export const settingKeyParamSchema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .max(100, 'Key must be 100 characters or less')
    .regex(/^[a-z0-9_]+$/, 'Key must contain only lowercase letters, numbers, and underscores'),
});

export const updateSettingSchema = z.object({
  value: z.string().max(10000, 'Value must be 10000 characters or less'),
});

export const updateBulkSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z
          .string()
          .min(1, 'Key is required')
          .max(100, 'Key must be 100 characters or less')
          .regex(/^[a-z0-9_]+$/, 'Key must contain only lowercase letters, numbers, and underscores'),
        value: z.string().max(10000),
      })
    )
    .min(1, 'At least one setting is required')
    .max(50, 'Maximum 50 settings can be updated at once'),
});

// Type exports
export type SettingKeyParam = z.infer<typeof settingKeyParamSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
export type UpdateBulkSettingsInput = z.infer<typeof updateBulkSettingsSchema>;
