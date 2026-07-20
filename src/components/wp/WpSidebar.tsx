import { NavLink, useParams, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MapPin,
  Map as MapIcon,
  HardHat,
  ShieldCheck,
  LayoutGrid,
  Calculator,
  FileText,
  Zap as ZapIcon,
  ShoppingCart,
  FileDiff,
  FlaskConical,
  FileCheck2,
  Ruler,
  CalendarRange,
  ListChecks,
  Users,
  FolderOpen,
  Camera,
  ScrollText,
  Zap,
  ChevronLeft,
  ClipboardList,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

type Leaf = { title: string; slug: string; icon: React.ComponentType<{ className?: string }> };
type Group = { label: string; items: Leaf[] };

const NAV: Group[] = [
  {
    label: "Overview",
    items: [{ title: "Overview", slug: "overview", icon: LayoutDashboard }],
  },
  {
    label: "Sites",
    items: [
      { title: "Site Register", slug: "sites/register", icon: MapPin },
      { title: "Delivery Matrix", slug: "sites/matrix", icon: LayoutGrid },
      { title: "Map", slug: "sites/map", icon: MapIcon },
      { title: "Pre-Construction", slug: "sites/pre-construction", icon: HardHat },
      { title: "Readiness", slug: "sites/readiness", icon: ShieldCheck },
      { title: "Surveys", slug: "sites/surveys", icon: ClipboardList },
    ],
  },
  {
    label: "Commercial",
    items: [
      { title: "EV Build Estimates", slug: "commercial/estimating", icon: Calculator },
      { title: "PoC Estimates", slug: "commercial/poc-estimates", icon: ZapIcon },
      { title: "Purchase Orders", slug: "commercial/purchase-orders", icon: ShoppingCart },
      { title: "Variations", slug: "commercial/variations", icon: FileDiff },
    ],
  },
  {
    label: "Engineering",
    items: [
      { title: "Grid Studies", slug: "engineering/grid-studies", icon: FlaskConical },
      { title: "DNO Offers", slug: "engineering/dno-offers", icon: FileCheck2 },
      { title: "Design", slug: "engineering/design", icon: Ruler },
    ],
  },
  {
    label: "Delivery",
    items: [
      { title: "Programme", slug: "delivery/programme", icon: CalendarRange },
      { title: "Tasks", slug: "delivery/tasks", icon: ListChecks },
      { title: "Partners", slug: "delivery/partners", icon: Users },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Documents", slug: "records/documents", icon: FolderOpen },
      { title: "Photos", slug: "records/photos", icon: Camera },
      { title: "Audit", slug: "records/audit", icon: ScrollText },
    ],
  },
  {
    label: "Close-out",
    items: [
      { title: "Commissioning", slug: "commissioning", icon: Zap },
    ],
  },
];

export const WP_NAV = NAV;

export function WpSidebar() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const base = `/wp/${id}`;
  const isActive = (slug: string) => pathname === `${base}/${slug}` || pathname.startsWith(`${base}/${slug}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Back to Programmes">
                  <NavLink to="/delivery" className="flex items-center gap-2">
                    <ChevronLeft className="h-4 w-4" />
                    {!collapsed && <span className="text-xs text-muted-foreground">Programmes</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {NAV.map((group) => {
          return (
            <SidebarGroup key={group.label}>
              {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.slug}>
                      <SidebarMenuButton asChild isActive={isActive(item.slug)} tooltip={item.title}>
                        <NavLink to={`${base}/${item.slug}`} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        {!collapsed && (
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Gridwise OS · Preview
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}