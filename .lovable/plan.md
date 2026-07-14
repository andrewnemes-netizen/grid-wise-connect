## Revenue Tracker module

Mirrors `EcoPower_Revenue_Tracker_11.xlsx` inside the app: two project logs, a monthly forecast, and three dashboards. Lives under `/delivery/revenue` and pulls from existing WPs/sites so nothing is re-keyed.

### Data model (new tables)

1. `revenue_projects` — one row per tracked project.
   - `id`, `org_id`, `stream` enum `'EV' | 'ICP'`, `project_code`, `client_id` (nullable FK `clients`), `site_id` (nullable FK `sites`), `wp_id` (nullable FK `work_packages`), `package_id`, `site_location`, `programme` (Connected Kerb / Westmorland & Furness / Plymouth / Other), `start_date`, `completion_date`, `app_date`, `energisation_date`, `po_number`, `contract_value`, `civils_contractor`, `elec_contractor`, `notes`.

2. `revenue_milestones` — invoice/milestone rows (this is what feeds the dashboards).
   - `id`, `project_id`, `milestone_status` (EV: Not Started / 5-Site 25% / 10-Site 50% / Commissioned 100%; ICP: Not Started / Upfront 40% / Completion 100%), `invoice_pct`, `invoice_month` (date, 1st of month), `forecast_revenue`, `actual_revenue`, `forecast_civils`, `actual_civils`, `forecast_elec`, `actual_elec`, `invoice_ref`, `notes`. Gross profit + GP% are computed in views/UI, not stored.

3. `revenue_forecast_budget` — one row per (org, stream, year, month) for FY budget targets used in the "FY Budget" and variance columns.

All three: RLS scoped by `org_id` via existing `org_members` pattern; GRANTs to `authenticated` + `service_role`; standard `updated_at` trigger.

### Views / RPCs

- `revenue_monthly_rollup(org_id, year)` — returns per stream per month: forecast rev, pipeline baseline rev, actual rev, forecast/actual civils, elec, GP, GP%. Powers Revenue Forecast sheet + all 3 dashboards.
- `revenue_milestone_breakdown(org_id, stream)` — counts, contract value, revenue, costs, GP, GP% per milestone status.
- Pipeline baseline = sum of `revenue_milestones.forecast_*` snapshotted at project creation (stored on the milestone row as `baseline_revenue`, `baseline_civils`, `baseline_elec`).

### UI

New route `/delivery/revenue` with tab layout:

1. **EV Log** — table of EV projects with inline milestone rows (expand a project to see its scheduled invoices). Add/edit project drawer; add milestone dialog with status → auto invoice %. Columns mirror the EV Log sheet.
2. **ICP Log** — same pattern, ICP-specific columns (App date, Energisation date, Upfront 40% / Completion 100%).
3. **Forecast** — year picker (default current FY). Grid: category rows × Jan–Dec + FY Total + FY Budget. Editable Budget cells; other cells read from the rollup view.
4. **Dashboard – EV** — KPI strip (Total projects, Contract value, Revenue invoiced, Civils, Elec, GP, GP%, FY Fc, FY Act, Variance), Monthly Fc vs Actual chart, Milestone breakdown table.
5. **Dashboard – ICP** — same shape, ICP milestones.
6. **Dashboard – Combined** — EV + ICP KPIs, monthly combined chart, programme mix table.

Also: Excel import (drag the tracker `.xlsx` to seed `revenue_projects` + `revenue_milestones`) and Excel export that reproduces the original sheet layout.

### Integration with existing app

- "Link to Work Package" on a revenue project pre-fills client, site, contract value, and creates milestone rows from the WP's approved estimate + any approved variations (uses `wp_estimate_variations` totals we just built).
- WP estimate approval optionally creates a matching `revenue_projects` row.
- Delivery dashboard gets a "Revenue" tile linking here.

### Technical notes

- Charts: `recharts` (already in project).
- Excel parse/generate: `xlsx` package (add if not present).
- GP% = `(revenue − civils − elec) / revenue`; guarded against div-by-zero in UI.
- Programme + milestone enums seeded from the `Lists` sheet; extendable via admin later.
- All money stored as `numeric(14,2)`.

### Out of scope (v1)

- Multi-currency, tax handling, actual invoice PDF generation, bank reconciliation, Xero/QuickBooks sync. We can add later.

### Files (approx.)

- `supabase/migrations/…_revenue_tracker.sql`
- `src/pages/DeliveryRevenue.tsx`
- `src/components/revenue/{EvLogTable,IcpLogTable,ForecastGrid,DashboardEv,DashboardIcp,DashboardCombined,ProjectDrawer,MilestoneDialog,ImportXlsx,ExportXlsx}.tsx`
- Route + nav entry under Delivery.
