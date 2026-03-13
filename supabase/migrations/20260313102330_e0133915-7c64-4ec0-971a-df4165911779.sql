
CREATE OR REPLACE FUNCTION public.clear_layer_features(_layer_id uuid, _table_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300s'
AS $$
DECLARE
  total_deleted integer := 0;
  batch_deleted integer;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  -- Validate table name against allowed tables
  IF _table_name NOT IN ('geo_substations', 'geo_feeders', 'geo_cables', 'geo_constraints', 'geo_points', 'geo_polygons') THEN
    RAISE EXCEPTION 'Invalid table name: %', _table_name;
  END IF;

  -- Delete in batches of 10000 to avoid lock contention
  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE ctid IN (SELECT ctid FROM %I WHERE layer_id = $1 LIMIT 10000)',
      _table_name, _table_name
    ) USING _layer_id;
    
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;
    
    EXIT WHEN batch_deleted = 0;
    
    -- Brief pause between batches
    PERFORM pg_sleep(0.05);
  END LOOP;

  -- Reset feature count
  UPDATE layer_registry
  SET feature_count = 0, updated_at = now()
  WHERE id = _layer_id;

  RETURN total_deleted;
END;
$$;
