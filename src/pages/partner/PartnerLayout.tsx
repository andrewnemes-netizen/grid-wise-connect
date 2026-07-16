import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, MapPin, FileCheck2, AlertTriangle, LogOut, Handshake, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePartnerMembership } from "@/hooks/usePartnerMembership";
import { Button } from "@/components/ui/button";
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
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const nav = [
  { title: "Dashboard", url: "/partner", icon: LayoutDashboard, end: true },
  { title: "Sites", url: "/partner/sites", icon: MapPin },
  { title: "Handover packs", url: "/partner/handover", icon: FileCheck2 },
  { title: "Outstanding items", url: "/partner/snags", icon: AlertTriangle },
];

function PartnerSidebar() {
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" />
              <span className="font-semibold">Partner Portal</span>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active = item.end ? pathname === item.url : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url} end={item.end} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2 space-y-2">
          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          <Button size="sm" variant="outline" className="w-full" onClick={() => signOut()}>
            <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function PartnerLayout() {
  const { isPartner, loading } = usePartnerMembership();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading partner portal…
      </div>
    );
  }

  if (!isPartner) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <Handshake className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">No partner access</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn't linked to a partner organisation. Ask an administrator to add you to a
            partner in the admin console.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <PartnerSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b px-2 gap-2">
            <SidebarTrigger />
            <div className="text-sm font-medium">Partner Portal</div>
          </header>
          <main className="flex-1 p-4 md:p-6 bg-muted/20">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}