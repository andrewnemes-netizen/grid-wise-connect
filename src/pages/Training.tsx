import { useState, useRef } from "react";
import { BookOpen, Download, ChevronRight, Map, MapPin, Cable, Pentagon, Ruler, SquareDashedBottom, Compass, Trash2, FolderOpen, Settings, Building2, Zap, Layers, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import jsPDF from "jspdf";

/* ------------------------------------------------------------------ */
/*  Section data                                                       */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  number: string;
  title: string;
  icon: React.ElementType;
  content: SubSection[];
}

interface SubSection {
  heading: string;
  body: string;
  tips?: string[];
}

const sections: Section[] = [
  {
    id: "getting-started",
    number: "1",
    title: "Getting Started",
    icon: BookOpen,
    content: [
      {
        heading: "Logging In",
        body: "Navigate to the app URL and enter your email and password. If you don't have an account, contact your administrator to be provisioned.",
      },
      {
        heading: "Sidebar Navigation",
        body: "The left-hand sidebar provides access to all main areas of the app: Map, Portfolio, LA Programme (internal users), and Admin (admin users only). Click the collapse icon at the top to minimise the sidebar and gain more map space.",
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
        body: "The vertical toolbar on the bottom-right of the map provides five core tools. Click a tool to activate it; click again to deactivate. Only one tool can be active at a time.",
      },
      {
        heading: "Boundary Tool",
        body: "Draw a site boundary polygon on the map. Click to add vertices and double-click to close the shape. The boundary is used to define the extent of a potential site.",
        tips: ["The boundary can be used in conjunction with the Drop Pin tool for a more accurate site assessment."],
      },
      {
        heading: "Drop Pin",
        body: "Click anywhere on the map to drop a pin at a potential site location. This triggers the Site Intelligence Panel which shows viability scoring, grid readiness, and connection cost estimates for that location.",
        tips: ["You can specify a proposed load (kW) to get more accurate cost estimates.", "The pin location is used as the centre point for finding nearby substations."],
      },
      {
        heading: "Connect Tool",
        body: "Draw a cable route between two or more points on the map. Click to add waypoints along the route, then double-click to finish. The tool calculates the total route length and estimated connection costs based on the cable type and excavation surface.",
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
    id: "portfolio",
    number: "6",
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
    number: "7",
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
    number: "8",
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
    number: "9",
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

/* ------------------------------------------------------------------ */
/*  PDF Export                                                         */
/* ------------------------------------------------------------------ */

function generateTrainingPdf() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };

  const checkSpace = (needed: number) => {
    if (y + needed > 270) addPage();
  };

  // Title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Gridwise Connect — Training Guide", margin, y);
  y += 12;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Eco Power Energy | Comprehensive user reference", margin, y);
  y += 15;

  sections.forEach((section) => {
    checkSpace(30);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`${section.number}. ${section.title}`, margin, y);
    y += 10;

    section.content.forEach((sub) => {
      checkSpace(20);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(sub.heading, margin, y);
      y += 6;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(sub.body, maxWidth);
      lines.forEach((line: string) => {
        checkSpace(6);
        doc.text(line, margin, y);
        y += 5;
      });
      y += 4;

      if (sub.tips && sub.tips.length > 0) {
        checkSpace(10);
        doc.setFont("helvetica", "italic");
        sub.tips.forEach((tip) => {
          const tipLines = doc.splitTextToSize(`💡 ${tip}`, maxWidth - 5);
          tipLines.forEach((line: string) => {
            checkSpace(6);
            doc.text(line, margin + 5, y);
            y += 5;
          });
        });
        doc.setFont("helvetica", "normal");
        y += 3;
      }
    });

    y += 5;
  });

  doc.save("Gridwise_Connect_Training_Guide.pdf");
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Training() {
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Table of Contents sidebar */}
      <aside className="w-64 shrink-0 border-r bg-muted/30 hidden lg:block">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Training Guide
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Gridwise Connect</p>
        </div>
        <ScrollArea className="h-[calc(100%-8rem)]">
          <nav className="p-2 space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <s.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {s.number}. {s.title}
                </span>
              </button>
            ))}
          </nav>
        </ScrollArea>
        <div className="p-3 border-t">
          <Button onClick={generateTrainingPdf} size="sm" className="w-full gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Gridwise Connect — Training Guide
            </h1>
            <p className="text-sm text-muted-foreground">
              Comprehensive user guide covering all features and workflows
            </p>
          </div>
          <Button onClick={generateTrainingPdf} size="sm" variant="outline" className="gap-2 lg:hidden">
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>

        {/* Sections */}
        <div className="max-w-4xl mx-auto p-6 space-y-10">
          {/* Intro card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm text-foreground leading-relaxed">
                Welcome to the <strong>Gridwise Connect</strong> training guide. This document covers every feature of the platform, from basic map navigation to advanced site assessment and cost estimation tools. Use the table of contents on the left to jump to any section, or scroll through the entire guide. You can also download this guide as a PDF for offline reference.
              </p>
            </CardContent>
          </Card>

          {sections.map((section) => (
            <div key={section.id} id={`section-${section.id}`} className="scroll-mt-20">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                  <section.icon className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {section.number}. {section.title}
                </h2>
              </div>

              <div className="space-y-4">
                {section.content.map((sub, idx) => (
                  <Card key={idx}>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" />
                        {sub.heading}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                        {sub.body}
                      </p>
                      {sub.tips && sub.tips.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {sub.tips.map((tip, ti) => (
                            <div key={ti} className="flex items-start gap-2 text-xs text-foreground/80 bg-accent/50 rounded-md px-3 py-2">
                              <span className="shrink-0">💡</span>
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {section.id !== sections[sections.length - 1].id && (
                <Separator className="mt-8" />
              )}
            </div>
          ))}

          {/* Footer */}
          <Card className="border-muted">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Need additional help? Contact your Eco Power Energy administrator or email support.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-2">
                Gridwise Connect Training Guide • Eco Power Energy • {new Date().getFullYear()}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
