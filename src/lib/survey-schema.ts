// Shared survey field schema — mirrors the Zoho "On-Street / Public Car Park
// Site Survey" form so submissions produce equivalent PDF output.

export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "number"
  | "yesno"
  | "date"
  | "signature"
  | "photo_group"
  | "composite_distance"
  | "static";

export interface SurveyField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  required?: boolean;
  /** Composite distance: allow multiple surface sub-rows summed into a total. */
  multi?: boolean;
  /** Photo group: max photos accepted. */
  maxPhotos?: number;
  /** Static block: markdown-ish body rendered as help. */
  body?: string;
  /** Link shown as helper text. */
  helpLink?: { label: string; url: string };
}

export interface SurveySection {
  key: string;
  title: string;
  fields: SurveyField[];
}

export const SURFACE_TYPES = ["Footway", "Carriageway", "Grass Verge", "Other"] as const;

export interface CompositeDistanceRow {
  surface: string;
  distance: number | null;
}
export interface CompositeDistanceValue {
  rows: CompositeDistanceRow[];
  description?: string;
}

export const SURVEY_SECTIONS: SurveySection[] = [
  {
    key: "job",
    title: "Job Description",
    fields: [
      { key: "site_survey_date", label: "Site Survey Date", type: "date", required: true, hint: "dd-MMM-yyyy HH:MM" },
      { key: "site_name_address", label: "Site name & Address", type: "text", required: true },
      {
        key: "dno_help",
        label: "Relevant DNO",
        type: "static",
        body: "Please navigate to the DNO map to confirm the correct DNO for this site.",
        helpLink: { label: "Open DNO Map", url: "https://www.energynetworks.org/customers/find-my-network-operator" },
      },
      {
        key: "relevant_dno",
        label: "Relevant DNO",
        type: "select",
        required: true,
        options: ["UKPN", "SSEN", "NPG", "NGED", "SPEN", "ENWL", "National Grid", "Other"],
      },
    ],
  },
  {
    key: "evcp",
    title: "EVCP / DNO Information",
    fields: [
      { key: "evcp_dual_model", label: "EV Charging Point (Dual)", type: "text", hint: "Model name / manufacturer" },
      { key: "evcp_dual_qty", label: "Quantity of Dual Charging Points", type: "number" },
      { key: "evcp_single_model", label: "EV Charging Point (Single)", type: "text", hint: "Model name / manufacturer" },
      { key: "evcp_single_qty", label: "Quantity of Single Charging Points", type: "number" },
      { key: "total_sockets", label: "Total Charge Point Socket Quantity", type: "number", hint: "Auto-calculated: (Dual × 2) + Single" },
      {
        key: "earth_solution",
        label: "Earth Solution",
        type: "select",
        options: ["Earth Mat (TT)", "TN-S", "TN-C-S (PME)", "Earth Rod (TT)", "Other"],
      },
      { key: "earth_methodology", label: "Earth Solution Methodology", type: "textarea", hint: "Explain why this earthing method has been selected" },
    ],
  },
  {
    key: "scenario",
    title: "Scenario",
    fields: [
      {
        key: "scenario",
        label: "Confirm the Scenario",
        type: "radio",
        required: true,
        options: ["On-Street EVCP Installation", "Public Car Park EVCP Installation"],
      },
      { key: "quick_notes", label: "Quick Notes", type: "textarea" },
    ],
  },
  {
    key: "dimensions",
    title: "Critical Dimensions (A–I)",
    fields: [
      {
        key: "dim_intro",
        label: "Reference",
        type: "static",
        body:
          "Please obtain the measurements below with photos for reference. A: POC to FP Total Distance; B: Width of Footway (FP side); C: Total civil distance FP to EVCP; D: Width of proposed Parking Bay; E: Total length of proposed EV Parking; F: Length of each EV Parking Bay; G: Width of Carriageway; H: Width of opposite Footway; I: Datum Point to FP Distance.",
      },
      { key: "dim_a", label: "A. POC to FP Distance (m)", type: "composite_distance", multi: true, required: true },
      { key: "dim_b", label: "B. Width of Footway (FP side) (m)", type: "composite_distance", required: true },
      { key: "dim_c", label: "C. Civil Distance FP to EVCPs (m)", type: "composite_distance", multi: true, required: true },
      { key: "dim_d", label: "D. Width of Proposed Parking Bay (m)", type: "composite_distance", hint: "Preferred: Width 2.0 m × Length 5.5 m" },
      { key: "dim_e", label: "E. Total Length of Proposed EV Parking (m)", type: "composite_distance" },
      { key: "dim_f", label: "F. Length of each EV Parking Bay (m)", type: "composite_distance" },
      { key: "dim_g", label: "G. Width of Carriageway (m)", type: "composite_distance" },
      { key: "dim_h", label: "H. Width of Opposite Footway (m)", type: "composite_distance" },
      { key: "dim_i", label: "I. Datum Point to FP Distance (m)", type: "composite_distance", hint: "Include the datum description (e.g. Lamppost, wall, postbox)" },
    ],
  },
  {
    key: "route",
    title: "Route & Photos",
    fields: [
      {
        key: "satellite_view",
        label: "POC to EVCP location (Satellite view)",
        type: "photo_group",
        required: true,
        maxPhotos: 3,
        hint: "Mandatory. Annotate the full dig route from POC → Feeder Pillar → EVCP. Include a point of reference (road name / business).",
      },
      {
        key: "what3words",
        label: "What3words for the feeder pillar location",
        type: "text",
        hint: "e.g. ///front.spell.tummy",
        helpLink: { label: "Open what3words", url: "https://what3words.com/" },
      },
      { key: "excavation_photos", label: "Excavation route photos (up to 5)", type: "photo_group", maxPhotos: 5 },
      { key: "excavation_photos_2", label: "Excavation route photos — additional (up to 5)", type: "photo_group", maxPhotos: 5 },
      { key: "excavation_hazard_description", label: "Excavation Route Hazard Description", type: "textarea", hint: "Known services, lampposts, walls adjacent to POC/FP/EVCP location, scarring, etc." },
    ],
  },
  {
    key: "logistics",
    title: "Excavation & Site Logistics",
    fields: [
      { key: "road_crossing_required", label: "Is Road Crossing Excavation Required?", type: "yesno" },
      { key: "traffic_management_required", label: "Is Traffic Management Required?", type: "yesno" },
      { key: "traffic_management_reason", label: "Traffic Management Reason", type: "textarea", hint: "If Yes above, explain why." },
      { key: "bay_marking_required", label: "Is Bay Marking Required?", type: "yesno" },
      { key: "hydroblasting_required", label: "Is HydroBlasting Required?", type: "yesno" },
      { key: "height_restriction_m", label: "Height Restriction (m)", type: "text", hint: "For Multi-storey / Surface Level car parks. Enter 'N/A' if none." },
    ],
  },
  {
    key: "conditions",
    title: "Site Conditions",
    fields: [
      { key: "flood_map_photos", label: "Flood Risk Map screenshot", type: "photo_group", maxPhotos: 2, helpLink: { label: "Check the Flood Risk", url: "https://check-long-term-flood-risk.service.gov.uk/postcode" } },
      { key: "flood_zone", label: "Flood Zone", type: "radio", options: ["Zone 1", "Zone 2", "Zone 3"], required: true },
      { key: "signal_test_photos", label: "Signal Test Screenshot", type: "photo_group", maxPhotos: 2, hint: "Screenshot from a signal-strength app on 3G/4G/5G." },
      { key: "signal_speed", label: "Signal speed", type: "text", hint: "Confirm upload > 2 Mbps and download > 5 Mbps" },
      { key: "signal_adequate", label: "Is there adequate signal?", type: "yesno" },
      { key: "existing_signpost", label: "Existing signpost present within site zone?", type: "yesno" },
      { key: "signpost_photos", label: "Signpost photos", type: "photo_group", maxPhotos: 3 },
      { key: "existing_parking_restrictions_details", label: "Existing Parking Restrictions (detail)", type: "textarea" },
      { key: "parking_restrictions_summary", label: "Parking Restrictions summary", type: "text", hint: "e.g. single/double yellow lines, loading bay, bus stops, school markings. Note if a Mixed-Use Sign is required." },
      { key: "ev_recharging_signs", label: "Electric Vehicle Recharging Point Signs required?", type: "yesno" },
      { key: "bay_suspension_required", label: "Are Parking Bay Suspensions required?", type: "yesno" },
      { key: "elevation_tolerance_ok", label: "Elevation within ±10 mm tolerance (trip-hazard free)?", type: "yesno" },
      { key: "surface_condition", label: "Surface Condition", type: "select", options: ["Good", "Fair", "Poor"] },
      { key: "asbestos_survey_required", label: "Asbestos Survey required?", type: "yesno" },
      { key: "out_of_hours", label: "Out of hours working required?", type: "yesno" },
      { key: "additional_hazards", label: "Additional Hazards", type: "textarea" },
      { key: "extraneous_parts", label: "Any Extraneous Parts within 2.5 metres", type: "textarea", hint: "e.g. Lamp post, water and gas pipes, structural steelwork etc" },
      { key: "anpr_cameras", label: "Are ANPR cameras present on site?", type: "yesno" },
      { key: "additional_photos", label: "Additional Image Upload", type: "photo_group", maxPhotos: 5 },
    ],
  },
  {
    key: "signoff",
    title: "Sign Off",
    fields: [
      { key: "overall_status", label: "Overall Status", type: "select", options: ["Complete", "Partial — follow-up needed", "Blocked"], required: true },
      { key: "signature", label: "Signature", type: "signature", required: true },
      { key: "first_name", label: "First Name", type: "text", required: true },
      { key: "last_name", label: "Last Name", type: "text", required: true },
      { key: "submitter_email", label: "Email", type: "text", required: true },
    ],
  },
];

// ---------- helpers ----------

export function computeTotalSockets(values: Record<string, any>): number {
  const dual = Number(values.evcp_dual_qty ?? 0) || 0;
  const single = Number(values.evcp_single_qty ?? 0) || 0;
  return dual * 2 + single;
}

export function sumComposite(v: CompositeDistanceValue | undefined | null): number | null {
  if (!v || !Array.isArray(v.rows)) return null;
  const total = v.rows.reduce((s, r) => s + (Number(r.distance) || 0), 0);
  return total || null;
}

/** Build the flattened rows the PDF renderer consumes. */
export function collectRowsForPdf(values: Record<string, any>) {
  return SURVEY_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.fields
      .filter((f) => f.type !== "signature" && f.type !== "photo_group" && f.type !== "static")
      .map((f) => {
        let display: any = values[f.key];
        if (f.type === "composite_distance") {
          const v = display as CompositeDistanceValue | undefined;
          if (!v || !v.rows?.length) return [f.label, null] as [string, any];
          const parts = v.rows
            .filter((r) => r.surface || (r.distance !== null && r.distance !== undefined && r.distance !== ("" as any)))
            .map((r) => `${r.surface || "—"}: ${r.distance ?? "—"} m`);
          const total = sumComposite(v);
          const desc = v.description ? ` — ${v.description}` : "";
          const totalStr = f.multi && total !== null ? `  (Total: ${total} m)` : "";
          return [f.label, `${parts.join("; ")}${totalStr}${desc}`] as [string, any];
        }
        if (f.key === "total_sockets") display = computeTotalSockets(values);
        return [f.label, display ?? null] as [string, any];
      }),
  }));
}