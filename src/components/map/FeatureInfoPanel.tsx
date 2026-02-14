import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FeatureInfoPanelProps {
  feature: Record<string, unknown> | null;
  layerLabel: string;
  onClose: () => void;
}

export function FeatureInfoPanel({ feature, layerLabel, onClose }: FeatureInfoPanelProps) {
  if (!feature) return null;

  const entries = Object.entries(feature).filter(
    ([key]) => !["id", "geometry", "geom", "ogc_fid"].includes(key.toLowerCase())
  );

  return (
    <div className="absolute bottom-4 left-3 z-10 w-80">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-primary/5">
          <span className="text-sm font-semibold text-foreground truncate">{layerLabel}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="max-h-60">
          <div className="px-3 py-2 space-y-1">
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attributes available.</p>
            ) : (
              entries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-xs py-0.5">
                  <span className="text-muted-foreground capitalize shrink-0">{key.replace(/_/g, " ")}</span>
                  <span className="text-foreground text-right truncate font-medium">{String(value ?? "—")}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
