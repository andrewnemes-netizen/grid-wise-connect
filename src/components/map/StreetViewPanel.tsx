/**
 * Street View Panel — fully interactive Google Street View with capture support.
 * Uses the Google Maps JavaScript API StreetViewPanorama for drag/click navigation.
 * Capture reads the current POV automatically.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { X, Camera, Loader2, Aperture } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GOOGLE_MAPS_KEY } from "@/hooks/useMap";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface StreetViewMarker {
  lat: number;
  lng: number;
  label: string;
  type: string;
  color: string;
}

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
  markers?: StreetViewMarker[];
  onCaptures?: (captures: StreetViewCapture[]) => void;
  existingCaptures?: StreetViewCapture[];
}

const IMG_W = 640;
const IMG_H = 400;

// ── Bearing & projection utilities ──

function calculateBearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(toLng - fromLng);
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function projectMarker(
  heading: number,
  pitch: number,
  markerBearing: number,
  distance: number,
  horizontalFov: number
): { xPct: number; yPct: number; visible: boolean; scale: number } {
  let rel = markerBearing - heading;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;

  if (Math.abs(rel) > horizontalFov / 2) return { xPct: 0, yPct: 0, visible: false, scale: 1 };

  const xPct = (rel / horizontalFov + 0.5) * 100;

  const baseYPct = distance < 10 ? 72 : distance < 30 ? 64 : distance < 80 ? 58 : 54;
  const horizontalFovRad = (horizontalFov * Math.PI) / 180;
  const verticalFovRad = 2 * Math.atan(Math.tan(horizontalFovRad / 2) * (IMG_H / IMG_W));
  const verticalFov = (verticalFovRad * 180) / Math.PI;
  const pitchOffsetPct = (pitch / Math.max(verticalFov, 1)) * 100;
  const yPct = clamp(baseYPct + pitchOffsetPct, 5, 95);

  const scale = distance < 10 ? 1.3 : distance < 30 ? 1.0 : distance < 80 ? 0.8 : 0.6;

  return { xPct, yPct, visible: true, scale };
}

const MARKER_INITIALS: Record<string, string> = {
  feeder_pillar: "F",
  charge_point: "E",
  ev_charger: "E",
  transformer: "T",
  rmu: "R",
  cutout: "C",
  joint: "J",
  pole: "P",
};

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
  markers = [],
  onCaptures,
  existingCaptures = [],
}: StreetViewPanelProps) {
  const { toast } = useToast();
  const [captures, setCaptures] = useState<StreetViewCapture[]>(existingCaptures);
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<any>(null);

  // Current POV tracked from the panorama
  const [cameraPosition, setCameraPosition] = useState({ lat, lng });
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(90);

  // Draggable marker offsets (relative to projected position)
  const [markerOffsets, setMarkerOffsets] = useState<Record<string, { dxPct: number; dyPct: number }>>({});
  const dragRef = useRef<{ key: string; startX: number; startY: number; origDxPct: number; origDyPct: number } | null>(null);

  useEffect(() => {
    setCameraPosition({ lat, lng });
    setMarkerOffsets({});
  }, [lat, lng]);

  // Initialise the interactive Street View panorama
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
        setMarkerOffsets({});
      });

      panoramaRef.current = pano;
      setReady(true);
    });

    return () => {
      cancelled = true;
      panoramaRef.current = null;
    };
  }, [lat, lng]);

  // Project markers onto the panorama view
  const projected = markers
    .map((m, i) => {
      const key = `${m.type}-${i}`;
      const bearing = calculateBearing(cameraPosition.lat, cameraPosition.lng, m.lat, m.lng);
      const distance = haversineM(cameraPosition.lat, cameraPosition.lng, m.lat, m.lng);
      const pos = projectMarker(heading, pitch, bearing, distance, fov);
      const offset = markerOffsets[key] ?? { dxPct: 0, dyPct: 0 };

      return {
        ...m,
        ...pos,
        xPct: clamp(pos.xPct + offset.dxPct, 0, 100),
        yPct: clamp(pos.yPct + offset.dyPct, 0, 100),
        distance,
        key,
      };
    })
    .filter((m) => m.visible && m.distance < 200);

  // Drag handlers for marker repositioning
  const handlePointerDown = useCallback((e: React.PointerEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const currentOffset = markerOffsets[key] ?? { dxPct: 0, dyPct: 0 };
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origDxPct: currentOffset.dxPct,
      origDyPct: currentOffset.dyPct,
    };
  }, [markerOffsets]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    setMarkerOffsets((prev) => ({
      ...prev,
      [dragRef.current!.key]: {
        dxPct: dragRef.current!.origDxPct + dx,
        dyPct: dragRef.current!.origDyPct + dy,
      },
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleCapture = useCallback(async () => {
    const angleNum = captures.length + 1;
    if (angleNum > 6) {
      toast({ title: "Maximum 6 captures" });
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

      // Draw marker overlays
      projected.forEach((m) => {
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
        ctx.fillText(MARKER_INITIALS[m.type] || m.label.charAt(0), x, y);

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
  }, [cameraPosition, heading, pitch, fov, captures, projected, onCaptures, toast]);

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 w-[520px] rounded-xl border bg-background/95 backdrop-blur shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Street View</span>
          {captures.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {captures.length}/6 captured
            </Badge>
          )}
          {ready && markers.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {projected.length} marker{projected.length !== 1 ? "s" : ""} in view
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Interactive panorama */}
      <div className="relative bg-muted" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />

        {/* Draggable marker overlay — sits on top of panorama, pointer-events only on markers */}
        {ready && projected.length > 0 && (
          <div
            ref={overlayRef}
            className="absolute inset-0 pointer-events-none select-none"
            style={{ zIndex: 5 }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {projected.map((m) => (
              <div
                key={m.key}
                className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing pointer-events-auto"
                style={{
                  left: `${m.xPct}%`,
                  top: `${m.yPct}%`,
                  transform: "translate(-50%, -50%)",
                  touchAction: "none",
                  zIndex: 10,
                }}
                onPointerDown={(e) => handlePointerDown(e, m.key)}
              >
                <div
                  className="rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-bold"
                  style={{
                    width: `${24 * m.scale}px`,
                    height: `${24 * m.scale}px`,
                    backgroundColor: m.color,
                    fontSize: `${11 * m.scale}px`,
                  }}
                >
                  {MARKER_INITIALS[m.type] || m.label.charAt(0)}
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

            {/* Marker count hint */}
            <div className="absolute bottom-2 left-2 pointer-events-none">
              <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur pointer-events-none">
                drag markers to reposition
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
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={capturing || captures.length >= 6 || !ready}
          onClick={handleCapture}
        >
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
      </div>

      {/* Captured thumbnails */}
      {captures.length > 0 && (
        <div className="px-3 py-2 border-t flex gap-2">
          {captures.map((cap, i) => (
            <div key={i} className="relative flex-1">
              <img
                src={cap.dataUrl}
                className="w-full h-16 object-cover rounded border"
                alt={cap.label}
              />
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
