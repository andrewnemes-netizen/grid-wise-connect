import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GOOGLE_MAPS_KEY } from "@/hooks/useMap";

interface StreetViewPanelProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

export function StreetViewPanel({ lat, lng, onClose }: StreetViewPanelProps) {
  const src = `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${lat},${lng}&heading=0&pitch=0&fov=90`;

  return (
    <div className="absolute top-2 right-14 z-20 w-[420px] rounded-xl border bg-background/95 backdrop-blur shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-semibold">Street View</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <iframe
        src={src}
        className="w-full h-[300px] border-0"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="px-3 py-1.5 text-xs text-muted-foreground">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>
    </div>
  );
}
