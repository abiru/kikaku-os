import { z } from 'zod';

// === Role Schemas ===

export const roleIdSchema = z.enum(['admin', 'manager', 'accountant', 'viewer']);

export type RoleId = z.infer<typeof roleIdSchema>;

// === Permission Schemas ===

export const permissionSchema = z.string().regex(
  /^[a-z-]+:(read|write|delete|approve)$/,
  'Permission must be in format "resource:action"'
);

export type Permission = z.infer<typeof permissionSchema>;

// All permissions defined in the system
export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_READ: 'dashboard:read',
  // Users
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  // Orders
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',
  // Products
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',
  PRODUCTS_DELETE: 'products:delete',
  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  // Inbox
  INBOX_READ: 'inbox:read',
  INBOX_APPROVE: 'inbox:approve',
  // Reports & Ledger
  REPORTS_READ: 'reports:read',
  LEDGER_READ: 'ledger:read',
  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  // Customers
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_WRITE: 'customers:write',
  // Tax Rates
  TAX_RATES_READ: 'tax-rates:read',
  TAX_RATES_WRITE: 'tax-rates:write',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

// === Admin User Schemas ===

export const adminUserIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const adminUserListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  role: roleIdSchema.optional(),
  active: z
    .enum(['true', 'false', 'all'])
    .optional()
    .default('all'),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

export const createAdminUserSchema = z.object({
  clerk_user_id: z
    .string()
    .min(1, 'Clerk user ID is required')
    .max(255, 'Clerk user ID must be 255 characters or less'),
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be 255 characters or less'),
  name: z
    .string()
    .max(255, 'Name must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  role_id: roleIdSchema.default('viewer'),
});

export const updateAdminUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be 255 characters or less')
    .optional(),
  name: z
    .string()
    .max(255, 'Name must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  role_id: roleIdSchema.optional(),
  is_active: z.boolean().optional(),
});

// === Type Exports ===

export type AdminUserIdParam = z.infer<typeof adminUserIdParamSchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

// === DB Row Types ===

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionRow {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: string;
}

export interface AdminUserRow {
  id: number;
  clerk_user_id: string;
  email: string;
  name: string | null;
  role_id: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserWithRole extends AdminUserRow {
  role_name: string;
  role_priority: number;
}
