import { Map, FolderOpen, Settings, LogOut, Building2, BookOpen, FlaskConical, Briefcase, PoundSterling, Bot, Handshake, Sparkles, ClipboardList } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePartnerMembership } from "@/hooks/usePartnerMembership";
import { RoleRequestDialog } from "@/components/RoleRequestDialog";
import epeLogo from "@/assets/epe-logo.png";
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
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Map", url: "/", icon: Map },
  { title: "Studies", url: "/studies", icon: FlaskConical },
  { title: "Delivery", url: "/programmes", icon: Briefcase },
  { title: "Intelligence", url: "/intelligence", icon: Sparkles },
  { title: "Revenue", url: "/delivery/revenue", icon: PoundSterling },
  { title: "Portfolio", url: "/portfolio", icon: FolderOpen },
  { title: "Surveys", url: "/surveys", icon: ClipboardList },
  { title: "Assistant", url: "/assistant", icon: Bot },
];

const internalItems = [
  { title: "LA Programme", url: "/la-programme", icon: Building2 },
];

const commonItems = [
  { title: "Training", url: "/training", icon: BookOpen },
];

const adminItems = [
  { title: "Admin", url: "/admin", icon: Settings },
  { title: "Archive Console", url: "/admin/archive", icon: Settings },
  { title: "Capability Grants", url: "/admin/capabilities", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, hasRole, signOut, orgName } = useAuth();
  const { isPartner } = usePartnerMembership();
  const showAdmin = hasRole("admin");
  const showInternal = hasRole("admin") || hasRole("engineer");
  const partnerItem = { title: "Partner Portal", url: "/partner", icon: Handshake };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              {collapsed ? (
                <img src={epeLogo} alt="EPE" className="h-5 w-5 object-contain" width={20} height={20} />
              ) : (
                <img src={epeLogo} alt="Eco Power Energy" className="h-6 object-contain" width={102} height={24} />
              )}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                ...navItems,
                ...(showInternal ? internalItems : []),
                ...commonItems,
                ...(isPartner ? [partnerItem] : []),
                ...(showAdmin ? adminItems : []),
              ].map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="group relative flex items-center gap-2 rounded-md text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="tracking-tight">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {!collapsed && <RoleRequestDialog />}
        <div className="flex flex-col gap-1 px-2 py-1">
          {!collapsed && orgName && (
            <span className="truncate text-[10px] font-medium text-sidebar-foreground/50 uppercase tracking-wider">
              {orgName}
            </span>
          )}
          {!collapsed && (
            <span className="truncate text-xs text-sidebar-foreground/70">
              {user?.email}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={signOut} className="ml-auto h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
