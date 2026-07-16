
DROP VIEW IF EXISTS public.v_wp_commercial_position;
CREATE VIEW public.v_wp_commercial_position AS
WITH
awarded_v2 AS (
  SELECT e.work_package_id,
         SUM(COALESCE(e.total_cost,0))        AS cost,
         SUM(COALESCE(e.total_price,0))       AS price,
         SUM(COALESCE(e.grand_total, e.total_price, 0)) AS grand_total
  FROM estimates e
  WHERE e.is_current = true
    AND lower(COALESCE(e.status,'')) = ANY (ARRAY['awarded','approved','accepted'])
  GROUP BY e.work_package_id
),
awarded_v1_ranked AS (
  SELECT wpe.work_package_id, wpe.total_cost, wpe.total_price,
         ROW_NUMBER() OVER (PARTITION BY wpe.work_package_id ORDER BY wpe.version_number DESC) rn
  FROM work_package_estimates wpe
  WHERE wpe.status = 'APPROVED'
),
awarded_v1 AS (
  SELECT work_package_id, COALESCE(total_cost,0) AS cost, COALESCE(total_price,0) AS price
  FROM awarded_v1_ranked WHERE rn = 1
),
awarded_site_ranked AS (
  SELECT ws.work_package_id, se.site_id, se.total_cost, se.total_price,
         ROW_NUMBER() OVER (PARTITION BY ws.work_package_id, se.site_id ORDER BY se.version_number DESC) rn
  FROM site_estimates se
  JOIN wp_sites ws ON ws.site_id = se.site_id
  WHERE se.status = 'APPROVED'
),
awarded_site AS (
  SELECT work_package_id,
         SUM(COALESCE(total_cost,0))  AS cost,
         SUM(COALESCE(total_price,0)) AS price
  FROM awarded_site_ranked WHERE rn = 1
  GROUP BY work_package_id
),
awarded AS (
  SELECT wp.id AS work_package_id,
         COALESCE(v2.cost,0)  + COALESCE(v1.cost,0)  + COALESCE(s.cost,0)  AS awarded_cost,
         COALESCE(v2.price,0) + COALESCE(v1.price,0) + COALESCE(s.price,0) AS awarded_price,
         COALESCE(v2.grand_total, COALESCE(v2.price,0))
           + COALESCE(v1.price,0) + COALESCE(s.price,0)                    AS awarded_grand_total
  FROM work_packages wp
  LEFT JOIN awarded_v2   v2 ON v2.work_package_id = wp.id
  LEFT JOIN awarded_v1   v1 ON v1.work_package_id = wp.id
  LEFT JOIN awarded_site s  ON s.work_package_id  = wp.id
),
actuals AS (
  SELECT ac_1.work_package_id,
    SUM(COALESCE(ac_1.amount,0)) AS actual_cost,
    SUM(CASE WHEN ac_1.category='labour'::actual_cost_category        THEN COALESCE(ac_1.amount,0) ELSE 0 END) AS actual_labour,
    SUM(CASE WHEN ac_1.category='material'::actual_cost_category      THEN COALESCE(ac_1.amount,0) ELSE 0 END) AS actual_material,
    SUM(CASE WHEN ac_1.category='plant'::actual_cost_category         THEN COALESCE(ac_1.amount,0) ELSE 0 END) AS actual_plant,
    SUM(CASE WHEN ac_1.category='subcontractor'::actual_cost_category THEN COALESCE(ac_1.amount,0) ELSE 0 END) AS actual_subcontractor,
    SUM(CASE WHEN ac_1.category='expense'::actual_cost_category       THEN COALESCE(ac_1.amount,0) ELSE 0 END) AS actual_expense,
    SUM(CASE WHEN ac_1.category='other'::actual_cost_category         THEN COALESCE(ac_1.amount,0) ELSE 0 END) AS actual_other
  FROM actual_costs ac_1
  GROUP BY ac_1.work_package_id
)
SELECT wp.id AS work_package_id,
       wp.code, wp.name, wp.status, wp.programme_id,
       GREATEST(COALESCE(wp.budget_amount,0), COALESCE(a.awarded_grand_total,0)) AS budget_amount,
       COALESCE(wp.budget_amount,0) AS budget_amount_manual,
       COALESCE(a.awarded_cost,0)        AS awarded_cost,
       COALESCE(a.awarded_price,0)       AS awarded_price,
       COALESCE(a.awarded_grand_total,0) AS awarded_grand_total,
       COALESCE(ac.actual_cost,0)        AS actual_cost,
       COALESCE(ac.actual_labour,0)      AS actual_labour,
       COALESCE(ac.actual_material,0)    AS actual_material,
       COALESCE(ac.actual_plant,0)       AS actual_plant,
       COALESCE(ac.actual_subcontractor,0) AS actual_subcontractor,
       COALESCE(ac.actual_expense,0)     AS actual_expense,
       COALESCE(ac.actual_other,0)       AS actual_other,
       COALESCE(a.awarded_cost,0) - COALESCE(ac.actual_cost,0)     AS cost_variance,
       GREATEST(COALESCE(wp.budget_amount,0), COALESCE(a.awarded_grand_total,0)) - COALESCE(ac.actual_cost,0)   AS budget_variance,
       COALESCE(a.awarded_price,0)  - COALESCE(ac.actual_cost,0)   AS forecast_margin,
       CASE WHEN COALESCE(a.awarded_price,0) > 0
            THEN (COALESCE(a.awarded_price,0) - COALESCE(ac.actual_cost,0)) / a.awarded_price
            ELSE NULL END AS forecast_margin_pct,
       CASE WHEN COALESCE(a.awarded_cost,0) > 0
            THEN COALESCE(ac.actual_cost,0) / a.awarded_cost
            ELSE NULL END AS cost_pct_of_awarded
FROM work_packages wp
LEFT JOIN awarded a  ON a.work_package_id  = wp.id
LEFT JOIN actuals ac ON ac.work_package_id = wp.id;

GRANT SELECT ON public.v_wp_commercial_position TO authenticated;
GRANT ALL ON public.v_wp_commercial_position TO service_role;
