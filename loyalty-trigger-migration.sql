-- ══════════════════════════════════════════════════════════════════
-- LOYALTY POINTS DB TRIGGER MIGRATION
-- Enforces: points awarded only on 'confirmed', deducted on 'cancelled'
-- ══════════════════════════════════════════════════════════════════

-- 1. Add tracking column to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS loyalty_points_awarded INTEGER NOT NULL DEFAULT 0;

-- 2. Helper function: calculate earned points (1 pt per Rs. 100)
CREATE OR REPLACE FUNCTION fn_calc_loyalty_points(order_total NUMERIC)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT FLOOR(order_total / 100)::INTEGER;
$$;

-- 3. Helper function: calculate tier from points
CREATE OR REPLACE FUNCTION fn_calc_tier(points INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN points >= 5000 THEN 'platinum'
    WHEN points >= 1500 THEN 'gold'
    WHEN points >= 500  THEN 'silver'
    ELSE 'bronze'
  END;
$$;

-- 4. The trigger function
CREATE OR REPLACE FUNCTION fn_loyalty_on_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id   UUID;
  v_points        INTEGER;
  v_current_pts   INTEGER;
  v_new_pts       INTEGER;
BEGIN
  -- Only act when status actually changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_customer_id := NEW.customer_id;

  -- ── CONFIRMED: award points ─────────────────────────────────────
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    -- Only award if customer exists and points not yet awarded
    IF v_customer_id IS NOT NULL AND NEW.loyalty_points_awarded = 0 THEN
      v_points := fn_calc_loyalty_points(NEW.total);

      IF v_points > 0 THEN
        -- Lock customer row for atomic update
        SELECT loyalty_points INTO v_current_pts
          FROM customers
          WHERE id = v_customer_id
          FOR UPDATE;

        v_new_pts := COALESCE(v_current_pts, 0) + v_points;

        -- Update customer balance + tier + stats
        UPDATE customers
          SET
            loyalty_points = v_new_pts,
            tier           = fn_calc_tier(v_new_pts),
            total_orders   = total_orders + 1,
            total_spent    = total_spent + NEW.total,
            updated_at     = NOW()
          WHERE id = v_customer_id;

        -- Record transaction
        INSERT INTO loyalty_transactions
          (customer_id, order_id, type, points, description, created_at)
        VALUES
          (v_customer_id, NEW.id, 'earned', v_points,
           'Earned from confirmed order #' || NEW.order_number,
           NOW());

        -- Mark points as awarded on the order
        NEW.loyalty_points_awarded := v_points;
      END IF;
    END IF;
  END IF;

  -- ── CANCELLED: deduct previously awarded points ──────────────────
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF v_customer_id IS NOT NULL AND OLD.loyalty_points_awarded > 0 THEN
      v_points := OLD.loyalty_points_awarded;

      SELECT loyalty_points INTO v_current_pts
        FROM customers
        WHERE id = v_customer_id
        FOR UPDATE;

      v_new_pts := GREATEST(0, COALESCE(v_current_pts, 0) - v_points);

      UPDATE customers
        SET
          loyalty_points = v_new_pts,
          tier           = fn_calc_tier(v_new_pts),
          total_orders   = GREATEST(0, total_orders - 1),
          total_spent    = GREATEST(0, total_spent - OLD.total),
          updated_at     = NOW()
        WHERE id = v_customer_id;

      INSERT INTO loyalty_transactions
        (customer_id, order_id, type, points, description, created_at)
      VALUES
        (v_customer_id, NEW.id, 'deducted', -v_points,
         'Points deducted — order #' || NEW.order_number || ' cancelled',
         NOW());

      -- Clear awarded points on order record
      NEW.loyalty_points_awarded := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Attach trigger to orders table
DROP TRIGGER IF EXISTS trg_loyalty_on_order_status ON orders;
CREATE TRIGGER trg_loyalty_on_order_status
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_loyalty_on_order_status_change();

-- 6. Grant execute to service_role (used by admin API)
GRANT EXECUTE ON FUNCTION fn_loyalty_on_order_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION fn_calc_loyalty_points(NUMERIC)     TO service_role;
GRANT EXECUTE ON FUNCTION fn_calc_tier(INTEGER)               TO service_role;
