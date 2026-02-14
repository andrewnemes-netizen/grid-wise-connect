

## EcoPower Feasibility Mapper — Implementation Plan

### Overview
A grid-intelligence mapping tool for EV charging and ICP connection feasibility screening. Internal engineers get full technical detail; clients see simplified viability outputs and branded reports.

---

### Phase 1: Foundation & Auth
- **Authentication** with Supabase — login/signup with email
- **Role-based access**: Admin, Engineer, Client
- **Dashboard layout** with sidebar navigation (Map, Portfolio, Admin)
- **Responsive design** that works on desktop and tablet for site teams

### Phase 2: Interactive Map
- **MapLibre GL JS** map with OpenStreetMap base tiles
- **Postcode / address search** with geocoding (pin drops on the map)
- **Draw polygon** tool for marking site boundaries
- **Layer toggle panel** to show/hide NPG datasets:
  - EHV feeders
  - HV feeders (33kV & 66kV)
  - Primary substations (33kV & 66kV)
  - HV & EHV underground cable segments
  - Network Development Plans
  - Footway/carriageway widths
  - Wayleaves
- **Click-to-identify**: tap any feature to see its attributes in a side panel
- **Legend** showing layer colours and symbols

### Phase 3: Site Feasibility Check (Core Feature)
- User drops a pin or draws a polygon and enters **proposed load (kW)**
- App queries Supabase/PostGIS for:
  - Nearest primary substations
  - Nearest HV/EHV feeder segments
  - Nearest underground cable segments (with capacity attributes)
  - NDP intersections
  - Highway width constraints along candidate corridors
  - Wayleave intersections
- Returns a **ranked Connection Options table** (sorted by distance)
- Generates a **Green / Amber / Red viability score** with reasons:
  - Green: <500m to viable asset, no major constraints
  - Amber: 500–1500m or one constraint flag
  - Red: >1500m or multiple constraints
- **Engineer view**: full asset IDs, exact distances, capacity numbers, NDP refs
- **Client view**: distance bands, simplified score, top risks, next steps only

### Phase 4: Portfolio & Site Management
- **Save sites** with name, postcode, coordinates, proposed kW, site type (depot / workplace / public / fleet)
- **Add notes** and status tags (investigating / viable / not viable)
- **Portfolio dashboard** with filters (score, status, region, date)
- **Site detail page** showing full feasibility record + history

### Phase 5: PDF Feasibility Report
- One-click **branded PDF export** with:
  - Eco Power Energy logo and branding
  - Map screenshot of the site + nearby assets
  - Connection options summary table
  - Viability score with reasoning
  - Key risks and recommended next steps
  - Assumptions, data date, and disclaimer
- Stored in Supabase Storage for re-download

### Phase 6: Admin & Audit
- **User management** panel (invite users, assign roles, deactivate)
- **Dataset metadata** view (layer name, source date, record count)
- **Audit log**: tracks every site view, feasibility check, and PDF export (who, when, what)

---

### Database (Supabase + PostGIS)
Tables for: users/profiles, sites, site_notes, all asset layers (substations, feeders, cables, NDP, highways, wayleaves), reports, and audit_log — all with appropriate RLS policies per role.

### Important Notes
- **Shapefile loading**: NPG shapefiles will need to be loaded into Supabase Postgres externally using ogr2ogr (outside Lovable). The app will query the resulting tables.
- **PostGIS extension**: Must be enabled in Supabase dashboard before spatial queries work.
- **MVP approach**: Start with GeoJSON from Supabase for map layers. Vector tile serving can be added later for performance at scale.

