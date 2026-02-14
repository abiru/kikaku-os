-- Enforce referential integrity for reviews.product_id
CREATE TRIGGER IF NOT EXISTS fk_reviews_product_id
BEFORE INSERT ON reviews
BEGIN
  SELECT RAISE(ABORT, 'Foreign key violation: reviews.product_id references non-existent product')
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id);
END;

-- Enforce referential integrity for reviews.product_id on UPDATE
CREATE TRIGGER IF NOT EXISTS fk_reviews_product_id_update
BEFORE UPDATE ON reviews
WHEN NEW.product_id != OLD.product_id
BEGIN
  SELECT RAISE(ABORT, 'Foreign key violation: reviews.product_id references non-existent product')
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id);
END;

-- Enforce referential integrity for inventory_thresholds.variant_id
CREATE TRIGGER IF NOT EXISTS fk_inventory_thresholds_variant_id
BEFORE INSERT ON inventory_thresholds
BEGIN
  SELECT RAISE(ABORT, 'Foreign key violation: inventory_thresholds.variant_id references non-existent variant')
  WHERE NOT EXISTS (SELECT 1 FROM variants WHERE id = NEW.variant_id);
END;

-- Enforce referential integrity for inventory_thresholds.variant_id on UPDATE
CREATE TRIGGER IF NOT EXISTS fk_inventory_thresholds_variant_id_update
BEFORE UPDATE ON inventory_thresholds
WHEN NEW.variant_id != OLD.variant_id
BEGIN
  SELECT RAISE(ABORT, 'Foreign key violation: inventory_thresholds.variant_id references non-existent variant')
  WHERE NOT EXISTS (SELECT 1 FROM variants WHERE id = NEW.variant_id);
END;
