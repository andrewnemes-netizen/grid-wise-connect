# 03 — Data Dictionary

Every new column and every altered column. Retention = default 7 years unless noted.

## Phase 1 — new tables

### `partners`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid fk organisations | tenant scope |
| name | text not null | |
| type | text | `icp`/`contractor`/`consultant` |
| status | text default 'active' | |
| primary_contact_email | text | |
| default_rate_card_id | uuid fk rate_cards | authorised partner rates |
| created_at/updated_at | timestamptz | |

### `partner_users`
| partner_id | uuid fk partners | |
| user_id | uuid fk auth.users | |
| role | text | `admin`/`viewer` |

### `wp_partner_allocations`
| wp_id | uuid fk work_packages | |
| partner_id | uuid fk partners | |
| site_id | uuid nullable fk sites | null = whole WP |
| allocated_at | timestamptz | |
| allocated_by | uuid | audit |

### `dno_offers`
| id, org_id, wp_id | | |
| dno_key | text | matches `dno_rulesets.dno_key` |
| offer_ref | text | DNO's reference |
| revision | int default 1 | supersede chain |
| offer_value | numeric | |
| received_at, expires_at | timestamptz | |
| status | text | `pending`/`accepted`/`expired`/`rejected` |

### `dno_offer_sites`
| dno_offer_id, site_id | joint pk | replaces `sites.dno_offer_id` |

### `purchase_orders`
| id, org_id, wp_id, client_id | | |
| po_number | text unique per org | |
| order_value | numeric | |
| status | text | `active`/`closed`/`amended` |
| issued_at, expires_at | timestamptz | |

### `po_lines`
| id, po_id | | |
| description | text | |
| line_value | numeric | |
| estimate_line_id | uuid nullable | ties to `estimate_lines` |

### `po_line_sites`
| po_line_id, site_id | joint pk | replaces `sites.po_id` |

### `design_submissions`
| id, wp_id, submitted_by (partner_id nullable) | | |
| revision | int default 1 | |
| submitted_at | timestamptz | |
| status | text | `submitted`/`in_review`/`approved`/`rejected` |

### `design_reviews`
| id, design_submission_id, reviewer_id | | |
| decision | text | `approved`/`rejected`/`comments` |
| comments | text | |
| decided_at | timestamptz | |

### `site_design_submissions`
| site_id, design_submission_id | joint pk | many-to-many |

### `site_stage_history`
| id, site_id, from_stage_id, to_stage_id, changed_by, changed_at, reason | | append-only |

### `stage_definitions`
| id, org_id nullable | | null = global default |
| key, label, colour | text | |
| category | text | pre-con/design/delivery/commissioning/handover/closed |
| order_index | int | |
| is_terminal | boolean | |

### `workflow_stage_sets` + `workflow_stage_set_stages`
Groups stage definitions per client workflow.

### `stage_transition_rules`
| from_stage_id, to_stage_id, required_role, required_gate, workflow_set_id | | |

## Phase 1 — altered
| Table | Column | Purpose |
|---|---|---|
| sites | + current_stage_id (fk stage_definitions) | replaces enum |
| sites | + primary_partner_id (fk partners) | denorm for filter perf; trigger-maintained |
| wp_sites | + partner_id | per-site override |
| project_files | + entity_type text, entity_id uuid, idx(entity_type,entity_id) | polymorphic |
| estimates | + visibility_lens_default, status enum extended | lenses + lifecycle |
| estimates | + parent_estimate_id | revisions (P4) |
| estimate_lines | + partner_visible bool | lens filter |
| wp_tasks | + scope check 'wp_level' | dual-model |
| project_tasks | + site_id nullable, scope check 'site_level' | dual-model |
| work_packages | + delivery_project_id, wp_procurement_unlocked, workflow_stage_set_id | idempotency + workflows |
| work_package_estimates | + preliminaries_pct, mobilisation_pct, contingency_pct | P4 |

## Phase 7 — resources
`resources`, `resource_calendars`, `resource_assignments`, `resource_skills`, `subcontractors` — see plan §C P7.

## Phase 8 — actuals
`actual_costs` (wp_id, site_id nullable, po_line_id nullable, amount, date, source).

## Phase 9 — construction
`permits`, `traffic_management_plans`, `rams_documents`, `daily_logs`, `site_photos`, `inspections`, `materials_deliveries`.

## Phase 10 — commissioning
`commissioning_records`, `test_certificates`, `snagging_items`, `handover_packs`.

## Views
`v_po_commitments`, `v_wp_kpis`, `v_estimate_lines_client/partner/dno`, `v_all_tasks`, `v_wp_commercial_position`, `mv_programme_dashboard`.

## Retention
All operational tables 7 years. `audit_log`, `site_stage_history`, `design_reviews`, `handover_packs` retained indefinitely (ISO 27001 traceability).

---
**Sign-off:** Product ☐  Delivery ☐  Engineering ☐