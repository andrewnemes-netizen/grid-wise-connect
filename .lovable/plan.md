I found the issue: SSEN Distribution auto-linking is only processing datasets where `active = true`. In your current data there are 34 SSEN Distribution datasets, but only 1 is active, so the function reuses the 23 existing layer definitions and links nothing new. That is why the toast says: `0 layers created, 23 reused, 0 datasets linked`.

Plan to fix it:

1. Update the database auto-link function
   - Change `auto_create_dno_layers` so it does not require SSEN Distribution datasets to already be active before linking.
   - For matched datasets, set:
     - `linked_layer_id`
     - `active = true`
     - `geometry_type` from the matched layer rule
     - `storage_table` from the matched layer rule
     - `updated_at = now()`
   - Keep the existing behavior for already-linked rows unless forced.

2. Restrict SSEN Distribution matching to Distribution datasets
   - Because SSEN Transmission and SSEN Distribution both use `dno = 'SSEN'`, add logic so Distribution rules only apply to `dataset_id LIKE 'dx-%'`.
   - Preserve Transmission rule matching for non-`dx-` SSEN datasets.

3. Improve the SSEN Distribution rules
   - Keep the existing SSEN Distribution dataset slug matching.
   - Add/adjust rules for the actual discovered dataset IDs, including:
     - `dx-primary-substation-boundaries`
     - `dx-secondary-substation-esa`
     - `dx-grid-supply-point-gsp-bulk-supply-point-bsp-electricity-supply-area-datasets`
     - `dx-ssen_smart_meter_prod_lv_feeder`
     - `dx-ssen-distribution-licence-area-boundaries`
     - `dx-generation-availability-and-network-capacity`
     - `dx-embedded_capacity_register`
     - `dx-nafirs-hv-faults`
     - `dx-nafirs-lv-faults`
     - `dx-realtime_outage_dataset`
     - `dx-technicallimits`
     - `dx-low_carbon_technologies`
     - `dx-isle_of_wight_active_network_management`
     - `dx-orkney_active_network_management`

4. Return useful debug output to the UI
   - Include `unmatched` in the result again so the admin panel can show which datasets did not auto-match.
   - Keep `layers_created`, `layers_reused`, `datasets_linked`, and `datasets_skipped` stable.

5. Patch the frontend call for SSEN Distribution
   - Pass a selector/source value such as `SSEN_DX` (or equivalent) into the RPC so it can safely distinguish Distribution from Transmission.
   - Keep the UI label and toast behavior as-is, but ensure the result panel never displays undefined values.

Expected result after approval: clicking Auto-Create & Link Layers on `SSEN — Distribution` should reuse the existing layer definitions and link/activate the matched Distribution datasets instead of reporting 0 linked.