# 04 — Permission Matrix

Legend: **A**=Admin · **E**=Engineer · **C**=Client (org member, non-staff) · **P**=Partner user · **–**=no access.
Actions: R=read · W=create/update · D=delete. Partner rows always additionally filtered to `partner_id ∈ wp_partner_allocations`.

## Core entities
| Entity | A | E | C | P |
|---|---|---|---|---|
| organisations | RWD | R | R (own) | R (own) |
| org_members / user_roles | RWD | R | – | – |
| profiles (own) | RW | RW | RW | RW |
| profiles.phone (others) | R via `admin_get_profile_phone` | – | – | – |
| clients | RWD | RW | R (own) | – |
| frameworks / contracts | RWD | RW | R (own) | – |
| programmes | RWD | RW | R (own) | R (allocated WPs' programme) |
| work_packages | RWD | RW | R (own) | R (allocated) |
| sites | RWD | RW | R (own) | R (allocated) |
| wp_sites | RWD | RW | R (own) | R (allocated) |

## Phase 1 entities
| Entity | A | E | C | P |
|---|---|---|---|---|
| partners | RWD | R | – | R (self) |
| partner_users | RWD | R | – | R (self) |
| wp_partner_allocations | RWD | RW | R (own) | R (self) |
| dno_offers, dno_offer_sites | RWD | RW | R (own) | – |
| purchase_orders, po_lines, po_line_sites | RWD | RW | R (own) | – |
| design_submissions | RWD | RW | R (own) | RW (self) |
| design_reviews | RWD | RW | R (own) | R (self subs) |
| site_design_submissions | RWD | RW | R (own) | R (self) |
| site_stage_history | R | RW | R (own) | R (allocated) |
| stage_definitions | RWD (global + own org) | R | R (own) | R (own) |
| workflow_stage_sets + rules | RWD | R | R (own) | R (own) |

## Estimating (P4)
| Entity | A | E | C | P |
|---|---|---|---|---|
| estimates | RWD | RW | R via `v_estimate_lines_client` | R via `v_estimate_lines_partner` |
| estimate_lines | RWD (internal lens) | RW | R (client lens) | R (partner lens, partner_visible=true) |
| rate_cards, rate_items, unit_rates | RWD | R | – | R (partner default only) |
| recipes | RWD | RW | – | – |
| wp_estimate_variations | RWD | RW | R (own, client lens) | – |

## Delivery / Programme (P6)
| Entity | A | E | C | P |
|---|---|---|---|---|
| wp_tasks | RWD | RW | R (own) | R (allocated) |
| project_tasks | RWD | RW | R (own) | RW (allocated, site-scoped) |
| wp_milestones / project_milestones | RWD | RW | R (own) | R (allocated) |
| programme_templates | RWD | RW | – | – |
| v_all_tasks | R (all) | R (all) | R (own) | R (allocated) |

## Resources (P7)
| Entity | A | E | C | P |
|---|---|---|---|---|
| resources, calendars, assignments, skills | RWD | RW | R (own) | – |
| subcontractors | RWD | RW | R (own) | R (self) |

## Commercial (P8)
| Entity | A | E | C | P |
|---|---|---|---|---|
| actual_costs | RWD | RW | R (own, client lens) | – |
| v_wp_commercial_position | R | R | R (client lens) | – |
| revenue_invoices, invoice_counters | RWD | RW | R (own) | – |

## Construction (P9)
| Entity | A | E | C | P |
|---|---|---|---|---|
| permits | RWD | RW | R (own) | RW (allocated) |
| traffic_management_plans | RWD | RW | R (own) | RW (allocated) |
| rams_documents | RWD | RW | R (own) | RW (allocated) |
| daily_logs | RWD | RW | R (own) | RW (allocated) |
| site_photos | RWD | RW | R (own) | RW (allocated) |
| inspections | RWD | RW | R (own) | RW (allocated) |
| materials_deliveries | RWD | RW | R (own) | R (allocated) |

## Commissioning / handover (P10)
| Entity | A | E | C | P |
|---|---|---|---|---|
| commissioning_records | RWD | RW | R (own) | R (allocated) |
| test_certificates | RWD | RW | R (own) | R (allocated) |
| snagging_items | RWD | RW | R (own) | RW (allocated) |
| handover_packs | RWD | RW | R (own) | R (allocated) |

## Assistant / MCP (P12)
MCP tools inherit caller's role. Partner-signed token → partner-scoped rows only. Write tools gated by role in addition to RLS.

## Enforcement rule of thumb
Every RLS policy uses `is_org_member(org_id)` OR `has_role(auth.uid(),'admin')`. Partner scope always adds `EXISTS (SELECT 1 FROM partner_users pu JOIN wp_partner_allocations wpa ON wpa.partner_id = pu.partner_id WHERE pu.user_id = auth.uid() AND wpa.wp_id = target.wp_id AND (wpa.site_id IS NULL OR wpa.site_id = target.site_id))`.

---
**Sign-off:** Product ☐  Delivery ☐  Engineering ☐  Security ☐