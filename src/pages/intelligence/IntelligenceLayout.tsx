import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, FileBarChart, Package, MapPin, Sparkles } from "lucide-react";

const tabs = [
  { to: "/intelligence", end: true, icon: LayoutDashboard, label: "Executive" },
  { to: "/intelligence/client-report", icon: FileBarChart, label: "Client Reports" },
  { to: "/intelligence/wp-report", icon: Package, label: "WP Reports" },
  { to: "/intelligence/site-report", icon: MapPin, label: "Site Reports" },
  { to: "/intelligence/ask", icon: Sparkles, label: "Ask Gridwise" },
];

export default function IntelligenceLayout() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="border-b bg-card/50">
        <div className="max-w-7xl mx-auto px-6 pt-6 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Gridwise Intelligence</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Executive dashboards, automated client reports and AI-driven programme insight.
              </p>
            </div>
          </div>
          <nav className="mt-5 flex flex-wrap gap-1">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 px-3 py-2 rounded-t-md text-sm transition-colors border-b-2 ${
                    isActive
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
