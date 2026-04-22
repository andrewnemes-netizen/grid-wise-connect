UPDATE layer_registry
SET geometry_type = 'MultiLineString',
    updated_at = now()
WHERE id = '11ba510c-9dd4-44c2-945d-6a9948875e5f';