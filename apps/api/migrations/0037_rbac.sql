-- Role-Based Access Control (RBAC) Tables

-- Roles table (static master data)
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,  -- 'admin', 'manager', 'viewer', 'accountant'
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,  -- Higher = more privileges (admin=100, manager=50, etc.)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Permissions table (static master data)
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,  -- 'users:read', 'orders:write', etc.
  name TEXT NOT NULL,
  resource TEXT NOT NULL,  -- 'users', 'orders', 'products', etc.
  action TEXT NOT NULL,    -- 'read', 'write', 'delete', 'approve'
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY(role_id) REFERENCES roles(id),
  FOREIGN KEY(permission_id) REFERENCES permissions(id)
);

-- Admin Users (links Clerk userId to role)
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_user_id TEXT NOT NULL UNIQUE,  -- Clerk's userId (sub claim)
  email TEXT NOT NULL,
  name TEXT,
  role_id TEXT NOT NULL DEFAULT 'viewer',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(role_id) REFERENCES roles(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_users_clerk ON admin_users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role_id);

-- Seed roles
INSERT OR IGNORE INTO roles (id, name, description, priority) VALUES
  ('admin', 'Administrator', 'Full system access', 100);
INSERT OR IGNORE INTO roles (id, name, description, priority) VALUES
  ('manager', 'Manager', 'Manage products, orders, and inventory', 50);
INSERT OR IGNORE INTO roles (id, name, description, priority) VALUES
  ('accountant', 'Accountant', 'View reports and ledger entries', 30);
INSERT OR IGNORE INTO roles (id, name, description, priority) VALUES
  ('viewer', 'Viewer', 'Read-only access to dashboard and orders', 10);

-- Seed permissions
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('dashboard:read', 'View Dashboard', 'dashboard', 'read', 'View dashboard metrics');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('users:read', 'View Users', 'users', 'read', 'View admin user list');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('users:write', 'Manage Users', 'users', 'write', 'Create and edit users');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('users:delete', 'Delete Users', 'users', 'delete', 'Delete admin users');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('orders:read', 'View Orders', 'orders', 'read', 'View order list and details');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('orders:write', 'Manage Orders', 'orders', 'write', 'Update order status');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('products:read', 'View Products', 'products', 'read', 'View product list');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('products:write', 'Manage Products', 'products', 'write', 'Create and edit products');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('products:delete', 'Delete Products', 'products', 'delete', 'Delete products');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('inventory:read', 'View Inventory', 'inventory', 'read', 'View stock levels');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('inventory:write', 'Manage Inventory', 'inventory', 'write', 'Adjust stock');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('inbox:read', 'View Inbox', 'inbox', 'read', 'View inbox items');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('inbox:approve', 'Approve Inbox', 'inbox', 'approve', 'Approve or reject items');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('reports:read', 'View Reports', 'reports', 'read', 'View daily reports');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('ledger:read', 'View Ledger', 'ledger', 'read', 'View journal entries');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('settings:read', 'View Settings', 'settings', 'read', 'View system settings');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('settings:write', 'Manage Settings', 'settings', 'write', 'Update system settings');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('customers:read', 'View Customers', 'customers', 'read', 'View customer list');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('customers:write', 'Manage Customers', 'customers', 'write', 'Edit customer info');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('tax-rates:read', 'View Tax Rates', 'tax-rates', 'read', 'View tax rate settings');
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
  ('tax-rates:write', 'Manage Tax Rates', 'tax-rates', 'write', 'Edit tax rate settings');

-- Seed role-permission mappings

-- Admin: All permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'dashboard:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'users:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'users:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'users:delete');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'orders:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'orders:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'products:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'products:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'products:delete');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'inventory:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'inventory:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'inbox:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'inbox:approve');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'reports:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'ledger:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'settings:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'settings:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'customers:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'customers:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'tax-rates:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('admin', 'tax-rates:write');

-- Manager: Most permissions except users, settings, and ledger
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'dashboard:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'orders:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'orders:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'products:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'products:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'products:delete');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'inventory:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'inventory:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'inbox:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'inbox:approve');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'customers:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'customers:write');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'reports:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('manager', 'tax-rates:read');

-- Accountant: Financial data access
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('accountant', 'dashboard:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('accountant', 'orders:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('accountant', 'reports:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('accountant', 'ledger:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('accountant', 'customers:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('accountant', 'tax-rates:read');

-- Viewer: Read-only basic access
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('viewer', 'dashboard:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('viewer', 'orders:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('viewer', 'products:read');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('viewer', 'customers:read');
