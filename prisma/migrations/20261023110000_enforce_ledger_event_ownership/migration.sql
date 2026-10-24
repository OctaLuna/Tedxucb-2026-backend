CREATE OR REPLACE FUNCTION assign_point_transaction_event_ownership() RETURNS TRIGGER AS $$
DECLARE selected_event_id UUID;
BEGIN
  selected_event_id := NULLIF(current_setting('ted.event_id', true), '')::uuid;
  IF selected_event_id IS NULL THEN
    selected_event_id := legacy_default_event_id();
  END IF;
  INSERT INTO point_transaction_event_ownership (point_transaction_id, event_id)
  VALUES (NEW.id, selected_event_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assign_point_transaction_event_ownership_after_insert
  AFTER INSERT ON point_transactions
  FOR EACH ROW EXECUTE FUNCTION assign_point_transaction_event_ownership();

CREATE OR REPLACE FUNCTION forbid_point_transaction_event_ownership_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La pertenencia de un movimiento al evento es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_point_transaction_event_ownership
  BEFORE UPDATE OR DELETE ON point_transaction_event_ownership
  FOR EACH ROW EXECUTE FUNCTION forbid_point_transaction_event_ownership_mutation();
