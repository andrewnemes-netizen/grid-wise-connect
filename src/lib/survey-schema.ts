// Shared survey field schema for the on-street / public car park site survey.
// Kept lightweight and generic to render dynamically.

export type FieldType = "text" | "textarea" | "select" | "number" | "yesno" | "image" | "signature";

export interface SurveyField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  required?: boolean;
  multi?: boolean;
}

export interface SurveySection {
  key: string;
  title: string;
  fields: SurveyField[];
}

export const SURVEY_SECTIONS: SurveySection[] = [
  {
    key: "job",
    title: "Job Description",
    fields: [
      { key: "scenario", label: "Site Scenario", type: "select", options: ["On-Street", "Public Car Park", "Mixed"], required: true },
      { key: "job_reference", label: "Job Reference", type: "text" },
      { key: "surveyor_notes", label: "General Site Notes", type: "textarea" },
    ],
  },
  {
    key: "evcp",
    title: "EVCP / DNO Information",
    fields: [
      { key: "evcp_count", label: "Number of EV Chargers", type: "number" },
      { key: "evcp_kw", label: "EVCP Rating (kW)", type: "number" },
      { key: "dno_reference", label: "DNO Reference / Quote Number", type: "text" },
      { key: "dno_name", label: "DNO", type: "select", options: ["UKPN", "SSEN", "NPG", "NGED", "SPEN", "ENWL", "Other"] },
      { key: "poc_type", label: "Point of Connection Type", type: "select", options: ["LV Feeder Pillar", "LV Cabinet", "Substation", "Overhead", "Other"] },
    ],
  },
  {
    key: "excavation",
    title: "POC / Feeder Pillar / EVCP Excavation",
    fields: [
      { key: "dim_a", label: "Dim A — POC to nearside kerb (m)", type: "number" },
      { key: "dim_b", label: "Dim B — POC to farside kerb (m)", type: "number" },
      { key: "dim_c", label: "Dim C — POC to EVCP (m)", type: "number" },
      { key: "dim_d", label: "Dim D — Feeder Pillar to POC (m)", type: "number" },
      { key: "dim_e", label: "Dim E — Feeder Pillar to EVCP (m)", type: "number" },
      { key: "dim_f", label: "Dim F — Trench length in footway (m)", type: "number" },
      { key: "dim_g", label: "Dim G — Trench length in carriageway (m)", type: "number" },
      { key: "dim_h", label: "Dim H — Trench length in grass/verge (m)", type: "number" },
      { key: "dim_i", label: "Dim I — Depth (m)", type: "number" },
      { key: "dim_j", label: "Dim J — Width (m)", type: "number" },
      { key: "dim_k", label: "Dim K — Reinstatement area (m²)", type: "number" },
      { key: "dim_l", label: "Dim L — Bollard offset (m)", type: "number" },
      { key: "surface_footway", label: "Footway Surface", type: "select", options: ["Tarmac", "Block Paving", "Concrete", "Slab", "Grass", "Other"] },
      { key: "surface_carriageway", label: "Carriageway Surface", type: "select", options: ["Tarmac", "Block Paving", "Concrete", "Other"] },
    ],
  },
  {
    key: "additional",
    title: "Additional Information",
    fields: [
      { key: "flood_risk", label: "Flood Risk on Site", type: "yesno" },
      { key: "mobile_signal", label: "Mobile Signal Adequate", type: "yesno" },
      { key: "parking_restrictions", label: "Parking Restrictions", type: "textarea" },
      { key: "additional_hazards", label: "Additional Hazards", type: "textarea" },
      { key: "extraneous_parts", label: "Extraneous Parts within 2.5 metres", type: "textarea", hint: "e.g. Lamp post, water and gas pipes, structural steelwork etc" },
      { key: "anpr_cameras", label: "ANPR cameras present on site?", type: "yesno" },
      { key: "photos", label: "Additional Image Upload", type: "image", multi: true },
    ],
  },
  {
    key: "signoff",
    title: "Sign Off",
    fields: [
      { key: "overall_status", label: "Overall Status", type: "select", options: ["Complete", "Partial — follow-up needed", "Blocked"], required: true },
      { key: "signature", label: "Signature", type: "signature", required: true },
      { key: "submitter_name", label: "Name", type: "text", required: true },
      { key: "submitter_email", label: "Email", type: "text", required: true },
    ],
  },
];

export function collectRowsForPdf(values: Record<string, unknown>) {
  return SURVEY_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.fields
      .filter((f) => f.type !== "image" && f.type !== "signature")
      .map((f) => [f.label, (values[f.key] as any) ?? null] as [string, any]),
  }));
}