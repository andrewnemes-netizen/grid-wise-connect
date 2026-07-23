import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { OutlookConnectBanner } from "@/components/outlook/OutlookConnectBanner";
import epeLogo from "@/assets/epe-logo.png";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border/60 bg-background/85 backdrop-blur px-4">
            <SidebarTrigger aria-label="Toggle sidebar" className="text-foreground/70 hover:text-foreground" />
            <div className="ml-3 flex items-center gap-2.5">
              <img src={epeLogo} alt="Eco Power Energy" className="h-5 object-contain" />
              <span className="font-display text-sm font-semibold tracking-tight text-foreground">Gridwise Connect</span>
              <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-accent" />
            </div>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </header>
          <OutlookConnectBanner />
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
