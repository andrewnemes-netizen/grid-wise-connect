DELETE FROM public.geo_polygons
WHERE layer_id IN (
  SELECT linked_layer_id FROM public.dno_dataset_registry
  WHERE dataset_id IN (
    'dx-primary-substation-boundaries',
    'dx-secondary-substation-esa',
    'dx-grid-supply-point-gsp-bulk-supply-point-bsp-electricity-supply-area-datasets',
    'dx-ssen-distribution-licence-area-boundaries'
  ) AND linked_layer_id IS NOT NULL
);

UPDATE public.dno_dataset_registry
SET last_sync_status = 'pending',
    last_sync_rows = 0,
    last_sync_error = NULL
WHERE dataset_id IN (
  'dx-primary-substation-boundaries',
  'dx-secondary-substation-esa',
  'dx-grid-supply-point-gsp-bulk-supply-point-bsp-electricity-supply-area-datasets',
  'dx-ssen-distribution-licence-area-boundaries',
  'dx-embedded_capacity_register'
);