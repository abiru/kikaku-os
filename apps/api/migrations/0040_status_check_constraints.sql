-- Status validation triggers for core tables
-- SQLite does not support ALTER TABLE ADD CONSTRAINT, so triggers enforce valid status values.

-- orders.status validation
CREATE TRIGGER IF NOT EXISTS trg_orders_status_insert
BEFORE INSERT ON orders
WHEN NEW.status NOT IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'fulfilled', 'partially_refunded')
BEGIN
  SELECT RAISE(ABORT, 'Invalid order status');
END;

CREATE TRIGGER IF NOT EXISTS trg_orders_status_update
BEFORE UPDATE OF status ON orders
WHEN NEW.status NOT IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'fulfilled', 'partially_refunded')
BEGIN
  SELECT RAISE(ABORT, 'Invalid order status');
END;

-- payments.status validation
CREATE TRIGGER IF NOT EXISTS trg_payments_status_insert
BEFORE INSERT ON payments
WHEN NEW.status NOT IN ('pending', 'succeeded', 'failed', 'refunded')
BEGIN
  SELECT RAISE(ABORT, 'Invalid payment status');
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_status_update
BEFORE UPDATE OF status ON payments
WHEN NEW.status NOT IN ('pending', 'succeeded', 'failed', 'refunded')
BEGIN
  SELECT RAISE(ABORT, 'Invalid payment status');
END;

-- inbox_items.status validation
CREATE TRIGGER IF NOT EXISTS trg_inbox_status_insert
BEFORE INSERT ON inbox_items
WHEN NEW.status NOT IN ('open', 'approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid inbox item status');
END;

CREATE TRIGGER IF NOT EXISTS trg_inbox_status_update
BEFORE UPDATE OF status ON inbox_items
WHEN NEW.status NOT IN ('open', 'approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid inbox item status');
END;
