import { BookOpen, Map, MapPin, Cable, Eye, FolderOpen, Zap, Building2, Settings, FlaskConical, PencilRuler } from "lucide-react";

export interface SubSection {
  heading: string;
  body: string;
  tips?: string[];
}

export interface Section {
  id: string;
  number: string;
  title: string;
  icon: React.ElementType;
  content: SubSection[];
}

export const trainingSections: Section[] = [
  {
    id: "getting-started",
    number: "1",
    title: "Getting Started",
    icon: BookOpen,
    content: [
      {
        heading: "Logging In",
        body: "Navigate to the app URL and sign in using your email and password, or use one of the social sign-in options. Gridwise Connect supports Sign in with Google and Sign in with Apple for quick, passwordless access. If you don't have an account, contact your administrator to be provisioned.",
        tips: ["Use 'Continue with Google' or 'Continue with Apple' for the fastest login experience."],
      },
      {
        heading: "Sidebar Navigation",
        body: "The left-hand sidebar provides access to all main areas of the app: Map, Portfolio, Studies, LA Programme (internal users), and Admin (admin users only). Click the collapse icon at the top to minimise the sidebar and gain more map space.",
      },
      {
        heading: "User Roles",
        body: "There are three roles in Gridwise Connect:\n• Viewer – can view the map and saved sites\n• Engineer – additionally has access to the LA Programme area\n• Admin – full access including data upload, layer management, and unit rate settings",
      },
    ],
  },
  {
    id: "map-navigation",
    number: "2",
    title: "Map View — Core Navigation",
    icon: Map,
    content: [
      {
        heading: "Postcode / Address Search",
        body: "Use the search bar in the top-left corner of the map to find any UK postcode or address. Type your query and press Enter or click the pin icon. Select a result from the dropdown to fly to that location.",
        tips: ["You can search for postcodes (e.g. NE1 4LP), street names, or place names."],
      },
      {
        heading: "Basemap Switcher",
        body: "Click the basemap switcher (bottom-left corner) to toggle between Street, Satellite, Light, and Dark map styles. Satellite view is particularly useful for identifying land type and site boundaries.",
      },
      {
        heading: "Zoom & Scale",
        body: "Use the + / − buttons (top-right) or scroll-wheel to zoom in and out. A scale bar at the bottom shows the current map scale.",
      },
      {
        heading: "DNO Filter",
        body: "Use the DNO dropdown to filter which Distribution Network Operator's assets are displayed on the map. Select 'All DNOs' to show everything, or pick a specific DNO.",
      },
      {
        heading: "Layer Toggle Panel",
        body: "Open the layer panel to switch individual data layers on or off. Layers include substations, cables, feeders, network development projects, constraints, and more. Each layer can be toggled independently.",
        tips: ["Only layers for the selected DNO will appear.", "Some layers are only visible at certain zoom levels."],
      },
      {
        heading: "Map Legend",
        body: "The legend (bottom-right) shows the colour coding for visible layers. Click 'Legend' to expand it. For substation utilisation layers, the legend shows a colour gradient from green (low utilisation) to red (high utilisation).",
      },
      {
        heading: "Heatmap Mode",
        body: "When viewing substation utilisation data, toggle Heatmap mode to see a heat-intensity overlay instead of individual point markers. This gives a quick visual overview of network capacity across an area.",
      },
    ],
  },
  {
    id: "map-tools",
    number: "3",
    title: "Map Tools",
    icon: MapPin,
    content: [
      {
        heading: "Tool Toolbar",
        body: "The vertical toolbar on the bottom-right of the map provides six core tools. Click a tool to activate it; click again to deactivate. Only one tool can be active at a time.",
      },
      {
        heading: "Boundary Tool",
        body: "Draw a site boundary polygon on the map. Click to add vertices and double-click to close the shape. The boundary is used to define the extent of a potential site. When a study is active, drawn boundaries are automatically saved to the study.",
        tips: ["The boundary can be used in conjunction with the Drop Pin tool for a more accurate site assessment.", "Use the Undo button during drawing to remove the last point."],
      },
      {
        heading: "Drop Pin",
        body: "Click anywhere on the map to drop a pin at a potential site location. This triggers the Site Intelligence Panel which shows viability scoring, grid readiness, and connection cost estimates for that location.",
        tips: ["You can specify a proposed load (kW) to get more accurate cost estimates.", "The pin location is used as the centre point for finding nearby substations."],
      },
      {
        heading: "Connect Tool",
        body: "Draw a cable route between two or more points on the map. Click to add waypoints along the route, then double-click to finish. The tool calculates the total route length and estimated connection costs based on the cable type and excavation surface. Routes drawn while a study is active are automatically saved to the study.",
      },
      {
        heading: "Design Mode",
        body: "Design Mode is an advanced tool available only when a study is active. It allows you to place electrical infrastructure elements (substations, cable joints, switchgear, etc.) directly onto the map. Each element is saved to the study and can be removed individually or cleared entirely.",
        tips: ["You must have an active study to use Design Mode.", "Select an element type from the Design Mode panel, then click on the map to place it.", "Design elements appear in the study detail page and can be included in PDF exports."],
      },
      {
        heading: "Polygon Search",
        body: "Draw a polygon on the map to search for substations and other assets within that area. Results appear in a table showing substation name, utilisation, headroom, and other key data.",
      },
      {
        heading: "Measure Tool",
        body: "Click points on the map to measure distances. The tool displays the total distance in metres or kilometres. Double-click to finish the measurement.",
      },
      {
        heading: "Clear All & Reset View",
        body: "Use the 'Clear All' button (trash icon) to remove all pins, boundaries, routes, and measurements from the map. The 'Reset View' button (compass icon) zooms back to the default UK-wide view.",
      },
    ],
  },
  {
    id: "site-intelligence",
    number: "4",
    title: "Site Intelligence Panel",
    icon: Eye,
    content: [
      {
        heading: "Overview",
        body: "When you drop a pin on the map, the Site Intelligence Panel appears on the left side. It provides an instant assessment of the site's viability for an EV charging connection.",
      },
      {
        heading: "Viability Score",
        body: "The viability score is shown as a traffic light rating:\n• GREEN – the site is likely viable with standard connection\n• AMBER – the site may require some reinforcement or has moderate constraints\n• RED – significant challenges are expected\n\nA numerical viability index (0–100) provides more granularity.",
      },
      {
        heading: "Grid Readiness",
        body: "Grid readiness indicates how prepared the local network is for a new connection:\n• Strong – ample capacity, fast connection expected\n• Moderate – some constraints but workable\n• Weak – capacity issues likely, reinforcement probable",
      },
      {
        heading: "Deployment Class",
        body: "The deployment class categorises the expected connection timeline:\n• Fast Deploy – connection within standard timescales\n• Standard – typical connection process\n• Needs Reinforcement – upstream reinforcement required, longer timeline",
      },
      {
        heading: "Connection Cost Estimate",
        body: "A budget estimate is provided based on nearby infrastructure, cable distances, and required equipment. Costs are shown as bands (£, ££, £££) with a detailed breakdown available.",
      },
      {
        heading: "Saving & Downloading",
        body: "Click 'Save Assessment' to store the site in your Portfolio for future reference. Click 'Download PDF' to generate a detailed report including the map screenshot, scores, and cost breakdown.",
        tips: ["Saved assessments can be compared side-by-side later.", "The PDF includes all scoring data and a map snapshot."],
      },
    ],
  },
  {
    id: "connect-assessment",
    number: "5",
    title: "Connect Assessment",
    icon: Cable,
    content: [
      {
        heading: "Drawing a Cable Route",
        body: "Activate the Connect tool and click on the map to define your cable route. Each click adds a waypoint. The route snaps to the road network where possible. Double-click to finish the route.",
      },
      {
        heading: "Route Controls",
        body: "While drawing, use the 'Undo' button to remove the last waypoint, or 'Finish' to complete the route. You can also press Escape to cancel.",
      },
      {
        heading: "Cost Breakdown",
        body: "Once a route is complete, the Connect Assessment Panel shows a detailed cost breakdown including:\n• Cable costs (per metre, by voltage level)\n• Excavation costs (carriageway, footway, verge)\n• Jointing and switchgear\n• Design and project management fees\n• Contingency",
      },
      {
        heading: "Comparing Routes",
        body: "Saved connection assessments can be compared to find the most cost-effective route. Use the comparison panel to view routes side-by-side.",
      },
    ],
  },
  {
    id: "studies",
    number: "6",
    title: "Studies",
    icon: FlaskConical,
    content: [
      {
        heading: "Overview",
        body: "Studies are collaborative workspaces for connection or design projects. Each study stores boundary drawings, cable routes, design elements, cost estimates, DNO rules engine output, and a bill of materials in one place.",
      },
      {
        heading: "Creating a Study",
        body: "Navigate to the Studies page and click 'New Study'. Provide a name, choose a mode (Connect for feasibility or Design for engineering), and optionally set a proposed load in kW. The study is created in 'draft' status.",
      },
      {
        heading: "Working with a Study on the Map",
        body: "Open a study on the map by clicking the arrow icon on the study card. The study name and status appear in a banner at the top of the map. While a study is active:\n• Boundaries you draw are automatically saved to the study\n• Cable routes are automatically saved to the study\n• Design Mode becomes available for placing infrastructure elements",
        tips: ["Look for the study name banner at the top of the map to confirm which study is active."],
      },
      {
        heading: "Study Detail Page",
        body: "Click the eye icon on a study card to open the detail page. This shows:\n• Study parameters (mode, load, dates, boundary/route status)\n• DNO Rules Engine output (duct sizes, cover depths, compliance flags)\n• Cost estimate with visual breakdown\n• Bill of Materials\n• Activity feed and comments",
      },
      {
        heading: "Sharing & Collaboration",
        body: "Share a study with colleagues using the Share button on the study detail page. Shared studies appear in the 'Shared with me' tab. Comments can be added to any study for team discussion.",
        tips: ["Shared users see the study in their own Studies list under a separate tab.", "Use comments to discuss findings and decisions directly within the study."],
      },
      {
        heading: "Batch Export",
        body: "Select multiple studies using the checkboxes and click 'Export as ZIP' to download PDF reports for all selected studies in a single archive.",
      },
      {
        heading: "PDF Export",
        body: "From the study detail page, click 'Export PDF' to generate a comprehensive report. You can customise which sections to include: cover page, site details, route map, electrical validation, cost breakdown, bill of materials, design elements, key findings, and next steps.",
      },
    ],
  },
  {
    id: "portfolio",
    number: "7",
    title: "Portfolio",
    icon: FolderOpen,
    content: [
      {
        heading: "Viewing Saved Sites",
        body: "The Portfolio page lists all your saved site assessments in a table view. Each row shows the site name, postcode, proposed kW, viability score, grid readiness, deployment class, cost band, and reinforcement probability.",
      },
      {
        heading: "Filtering & Sorting",
        body: "Use the dropdown filters at the top to narrow results by score, grid readiness, cost band, deployment class, or status. Click any column header to sort the table.",
      },
      {
        heading: "Comparing Assessments",
        body: "Select multiple sites using the checkboxes and click 'Compare' to view them side-by-side. This helps identify the most viable sites in your pipeline.",
      },
      {
        heading: "Site Detail",
        body: "Click the eye icon on any row to navigate to the full Site Detail page, which includes the complete assessment data, notes, and the ability to download a PDF report.",
      },
      {
        heading: "Export",
        body: "Click 'Export CSV' to download the entire portfolio as a spreadsheet for offline analysis or reporting.",
      },
    ],
  },
  {
    id: "quick-estimate",
    number: "8",
    title: "Quick Estimate (Public)",
    icon: Zap,
    content: [
      {
        heading: "What It Is",
        body: "The Quick Estimate tool is a public-facing page that doesn't require login. It allows anyone to enter a UK postcode and proposed load (kW) to get an instant high-level viability assessment.",
      },
      {
        heading: "How to Use",
        body: "1. Enter the site postcode (e.g. NE1 4LP)\n2. Enter the proposed load in kW (e.g. 250 for a rapid charger)\n3. Click 'Get Instant Assessment'\n\nThe result shows a viability score and budget estimate.",
        tips: [
          "Typical loads: 50kW (fast charger), 150kW (rapid), 350kW (ultra-rapid).",
          "Share the Quick Estimate URL with clients for self-service enquiries.",
        ],
      },
    ],
  },
  {
    id: "la-programme",
    number: "9",
    title: "LA Programme (Internal)",
    icon: Building2,
    content: [
      {
        heading: "CSV Upload",
        body: "Upload a CSV file containing multiple site locations for batch scoring. The CSV should include columns for site name, postcode or coordinates, and proposed load. The system will score each site automatically.",
      },
      {
        heading: "Programme Dashboard",
        body: "The dashboard provides an overview of all sites in the programme, with summary statistics, charts, and the ability to filter and drill into individual sites.",
        tips: ["This feature is only available to users with the Engineer or Admin role."],
      },
    ],
  },
  {
    id: "admin",
    number: "10",
    title: "Admin (Admin Only)",
    icon: Settings,
    content: [
      {
        heading: "Layer Management",
        body: "View, enable/disable, and manage all data layers in the system. Each layer shows its DNO, category, feature count, and enabled status. Use the toggle to show or hide layers on the map.",
      },
      {
        heading: "Site Data Upload",
        body: "Upload new geospatial data files (GeoJSON, GML) to create or update layers. The system automatically detects geometry types and categorises the data.",
      },
      {
        heading: "Unit Rate Settings",
        body: "Configure the cost rates used in connection cost estimates. These include cable costs per metre, excavation rates, switchgear costs, transformer costs, and percentage fees for design, project management, and contingency.",
        tips: ["Changes to unit rates affect all future cost estimates.", "Historical assessments retain the rates that were current at the time."],
      },
      {
        heading: "Users & Roles",
        body: "Manage user accounts and role assignments. Assign users the Viewer, Engineer, or Admin role to control their access level.",
      },
      {
        heading: "Audit Log",
        body: "View a chronological log of all actions taken in the system, including site assessments, data uploads, and configuration changes.",
      },
    ],
  },
];
