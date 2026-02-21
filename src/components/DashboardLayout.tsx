import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import epeLogo from "@/assets/epe-logo.png";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex h-12 items-center border-b bg-background px-4">
            <SidebarTrigger />
            <div className="ml-3 flex items-center gap-2">
              <img src={epeLogo} alt="Eco Power Energy" className="h-5 object-contain" />
              <span className="text-sm font-semibold text-foreground">Gridwise Connect</span>
            </div>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
