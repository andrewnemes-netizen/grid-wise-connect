/**
 * Street View Panel — interactive Street View with local, screen-locked markers.
 * Markers are managed only inside this view for capture composition.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { X, Camera, Loader2, Check, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GOOGLE_MAPS_KEY } from "@/hooks/useMap";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface StreetViewCapture {
  dataUrl: string;
  heading: number;
  pitch: number;
  label: string;
}

interface StreetViewPanelProps {
  lat: number;
  lng: number;
  onClose: () => void;
  onCaptures?: (captures: StreetViewCapture[]) => void;
  existingCaptures?: StreetViewCapture[];
}

type EquipmentTypeOption = {
  type: string;
  label: string;
  color: string;
  symbol: string;
};

type LocalStreetViewMarker = {
  id: string;
  type: string;
  label: string;
  color: string;
  symbol: string;
  xPct: number;
  yPct: number;
  scale: number;
};

const EQUIPMENT_OPTIONS: EquipmentTypeOption[] = [
  { type: "transformer", label: "Transformer", color: "#e74c3c", symbol: "T" },
  { type: "rmu", label: "Ring Main Unit", color: "#3498db", symbol: "R" },
  { type: "feeder_pillar", label: "Feeder Pillar", color: "#2ecc71", symbol: "F" },
  { type: "cutout", label: "Cutout", color: "#f39c12", symbol: "C" },
  { type: "joint", label: "Joint", color: "#9b59b6", symbol: "J" },
  { type: "pole", label: "Pole", color: "#1abc9c", symbol: "P" },
  { type: "ev_charger", label: "EV Charger", color: "#00b894", symbol: "E" },
];

const IMG_W = 640;
const IMG_H = 400;
const MAX_CAPTURES = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Load Google Maps JS API once
let gmapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (gmapsPromise) return gmapsPromise;
  if ((window as any).google?.maps?.StreetViewPanorama) {
    gmapsPromise = Promise.resolve();
    return gmapsPromise;
  }
  gmapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return gmapsPromise;
}

export function StreetViewPanel({
  lat,
  lng,
  onClose,
  onCaptures,
  existingCaptures = [],
}: StreetViewPanelProps) {
  const { toast } = useToast();
  const [captures, setCaptures] = useState<StreetViewCapture[]>(existingCaptures);
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const [markers, setMarkers] = useState<LocalStreetViewMarker[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<any>(null);

  // Current POV tracked from the panorama
  const [cameraPosition, setCameraPosition] = useState({ lat, lng });
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(90);

  const dragRef = useRef<{ key: string; startX: number; startY: number; origXPct: number; origYPct: number } | null>(null);

  useEffect(() => {
    setCameraPosition({ lat, lng });
    setMarkers([]);
  }, [lat, lng]);

  // Initialise interactive Street View panorama
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;

      const pano = new (window as any).google.maps.StreetViewPanorama(containerRef.current, {
        position: { lat, lng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        linksControl: true,
        panControl: true,
        zoomControl: true,
        enableCloseButton: false,
      });

      pano.addListener("pov_changed", () => {
        const pov = pano.getPov();
        setHeading(pov.heading);
        setPitch(pov.pitch);
      });

      pano.addListener("zoom_changed", () => {
        const z = pano.getZoom();
        setFov(180 / Math.pow(2, Math.max(z, 0)));
      });

      pano.addListener("position_changed", () => {
        const pos = pano.getPosition();
        if (!pos) return;
        setCameraPosition({ lat: pos.lat(), lng: pos.lng() });
      });

      panoramaRef.current = pano;
      setReady(true);
    });

    return () => {
      cancelled = true;
      panoramaRef.current = null;
    };
  }, [lat, lng]);

  const handleAddMarker = useCallback(
    (type: string) => {
      const option = EQUIPMENT_OPTIONS.find((e) => e.type === type);
      if (!option) return;

      setMarkers((prev) => {
        const typeCount = prev.filter((m) => m.type === type).length + 1;
        const stackOffset = Math.min(prev.length, 5) * 4;
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            type,
            label: `${option.label} ${typeCount}`,
            color: option.color,
            symbol: option.symbol,
            xPct: clamp(50 + stackOffset, 8, 92),
            yPct: clamp(64 + stackOffset * 0.4, 10, 92),
            scale: 1,
          },
        ];
      });
    },
    []
  );

  const handleDeleteMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Drag handlers for marker repositioning
  const handlePointerDown = useCallback((e: React.PointerEvent, markerId: string, currentXPct: number, currentYPct: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      key: markerId,
      startX: e.clientX,
      startY: e.clientY,
      origXPct: currentXPct,
      origYPct: currentYPct,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;

    setMarkers((prev) =>
      prev.map((m) =>
        m.id === dragRef.current!.key
          ? {
              ...m,
              xPct: clamp(dragRef.current!.origXPct + dx, 0, 100),
              yPct: clamp(dragRef.current!.origYPct + dy, 0, 100),
            }
          : m
      )
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleCapture = useCallback(async () => {
    const angleNum = captures.length + 1;
    if (angleNum > MAX_CAPTURES) {
      toast({ title: `Maximum ${MAX_CAPTURES} captures` });
      return;
    }

    setCapturing(true);
    try {
      const { data, error } = await supabase.functions.invoke("street-view-proxy", {
        body: { lat: cameraPosition.lat, lng: cameraPosition.lng, heading, pitch, fov, width: IMG_W, height: IMG_H },
      });

      if (error) throw new Error(error.message || "Proxy error");
      if (!data?.image_base64) throw new Error("No image returned");

      const canvas = document.createElement("canvas");
      canvas.width = IMG_W;
      canvas.height = IMG_H;
      const ctx = canvas.getContext("2d")!;

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = `data:image/jpeg;base64,${data.image_base64}`;
      });
      ctx.drawImage(img, 0, 0, IMG_W, IMG_H);

      // Draw local marker overlays
      markers.forEach((m) => {
        const x = (m.xPct / 100) * IMG_W;
        const y = (m.yPct / 100) * IMG_H;
        const r = 14 * m.scale;

        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();

        ctx.font = `bold ${Math.round(12 * m.scale)}px Arial`;
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.symbol, x, y);

        ctx.font = `bold ${Math.round(10 * m.scale)}px Arial`;
        ctx.textBaseline = "top";
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 3;
        ctx.strokeText(m.label, x, y + r + 4);
        ctx.fillStyle = "white";
        ctx.fillText(m.label, x, y + r + 4);
      });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const newCapture: StreetViewCapture = {
        dataUrl,
        heading,
        pitch,
        label: `Street View — Angle ${angleNum}`,
      };

      const updated = [...captures, newCapture];
      setCaptures(updated);
      onCaptures?.(updated);
      toast({ title: `Angle ${angleNum} captured`, description: `Heading: ${Math.round(heading)}°` });
    } catch (err: any) {
      console.error("Street view capture failed:", err);
      toast({
        title: "Capture failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setCapturing(false);
    }
  }, [cameraPosition, heading, pitch, fov, captures, markers, onCaptures, toast]);

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 w-[520px] rounded-xl border bg-background/95 backdrop-blur shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Street View</span>
          {captures.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {captures.length}/{MAX_CAPTURES} captured
            </Badge>
          )}
          {ready && markers.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {markers.length} marker{markers.length !== 1 ? "s" : ""} in view
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1">
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              {EQUIPMENT_OPTIONS.map((eq) => (
                <DropdownMenuItem key={eq.type} onClick={() => handleAddMarker(eq.type)} className="text-xs gap-2">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ backgroundColor: eq.color }}
                  >
                    {eq.symbol}
                  </div>
                  {eq.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Interactive panorama */}
      <div className="relative bg-muted" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />

        {ready && markers.length > 0 && (
          <div
            ref={overlayRef}
            className="absolute inset-0 pointer-events-none select-none"
            style={{ zIndex: 5 }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {markers.map((m) => (
              <div
                key={m.id}
                className="absolute flex flex-col items-center pointer-events-auto"
                style={{
                  left: `${m.xPct}%`,
                  top: `${m.yPct}%`,
                  transform: "translate(-50%, -50%)",
                  touchAction: "none",
                  zIndex: 10,
                }}
              >
                <button
                  className="absolute -top-2 -right-3 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ zIndex: 20, fontSize: "8px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMarker(m.id);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>

                <div
                  className="rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-bold cursor-grab active:cursor-grabbing"
                  style={{
                    width: `${24 * m.scale}px`,
                    height: `${24 * m.scale}px`,
                    backgroundColor: m.color,
                    fontSize: `${11 * m.scale}px`,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, m.id, m.xPct, m.yPct)}
                >
                  {m.symbol}
                </div>
                <span
                  className="text-white font-semibold mt-0.5 pointer-events-none whitespace-nowrap"
                  style={{
                    fontSize: `${9 * m.scale}px`,
                    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  }}
                >
                  {m.label}
                </span>
              </div>
            ))}

            <div className="absolute bottom-2 left-2 pointer-events-none">
              <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur pointer-events-none">
                markers are locked to screen · drag to reposition
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Capture bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t">
        <span className="text-xs text-muted-foreground">
          {cameraPosition.lat.toFixed(5)}, {cameraPosition.lng.toFixed(5)} · {Math.round(heading)}° hdg
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" disabled={capturing || captures.length >= MAX_CAPTURES || !ready} onClick={handleCapture}>
            {capturing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Capturing…
              </>
            ) : (
              <>
                <Camera className="h-3 w-3 mr-1" />
                Capture Angle {captures.length + 1}
              </>
            )}
          </Button>
          {captures.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>
              <Check className="h-3 w-3 mr-1" />
              Done
            </Button>
          )}
        </div>
      </div>

      {/* Captured thumbnails */}
      {captures.length > 0 && (
        <div className="px-3 py-2 border-t flex gap-2">
          {captures.map((cap, i) => (
            <div key={i} className="relative flex-1">
              <img src={cap.dataUrl} className="w-full h-16 object-cover rounded border" alt={cap.label} />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 rounded-b">
                {cap.label} — {Math.round(cap.heading)}°
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
