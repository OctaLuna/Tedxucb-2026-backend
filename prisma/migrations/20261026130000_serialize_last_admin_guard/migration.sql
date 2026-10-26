-- RF-119: serialize all operations that could remove an active ADMIN.
-- Without a shared transaction lock, concurrent DELETE/UPDATE statements
-- can each observe the other administrator in their snapshot and both pass.
CREATE OR REPLACE FUNCTION forbid_removing_last_admin() RETURNS TRIGGER AS $$
DECLARE
  remaining_admins INTEGER;
BEGIN
  -- The same key is used by forbid_disabling_last_admin, so mixed changes
  -- (role deletion and user disable) cannot race either.
  PERFORM pg_advisory_xact_lock(17012026, 119);

  SELECT COUNT(*) INTO remaining_admins
  FROM user_roles ur
  JOIN users u ON u.id = ur.user_id
  WHERE ur.role = 'ADMIN'
    AND u.status = 'ACTIVE'
    AND ur.user_id <> OLD.user_id;

  IF remaining_admins = 0 THEN
    RAISE EXCEPTION
      'No se puede retirar el rol de administrador: el sistema quedaria sin ningun administrador activo (RF-119)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION forbid_disabling_last_admin() RETURNS TRIGGER AS $$
DECLARE
  remaining_admins INTEGER;
BEGIN
  IF NEW.status = 'DISABLED' AND OLD.status <> 'DISABLED' THEN
    PERFORM pg_advisory_xact_lock(17012026, 119);

    SELECT COUNT(*) INTO remaining_admins
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.role = 'ADMIN' AND u.status = 'ACTIVE' AND u.id <> NEW.id;

    IF remaining_admins = 0
       AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.id AND role = 'ADMIN') THEN
      RAISE EXCEPTION
        'No se puede deshabilitar: es el unico administrador activo (RF-119)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
