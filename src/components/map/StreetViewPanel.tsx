/**
 * Enhanced Street View Panel with:
 * - Google Static Street View API (no iframe)
 * - Heading & pitch controls
 * - Map marker overlays projected via bearing calculation
 * - 2-angle capture for PDF reports (via edge function proxy)
 */
import { useState, useCallback, useRef } from "react";
import { X, Camera, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
}

const IMG_W = 640;
const IMG_H = 400;
const FOV = 90;

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

function projectMarker(
  heading: number,
  markerBearing: number,
  distance: number
): { xPct: number; yPct: number; visible: boolean; scale: number } {
  let rel = markerBearing - heading;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;

  if (Math.abs(rel) > FOV / 2) return { xPct: 0, yPct: 0, visible: false, scale: 1 };

  const xPct = (rel / FOV + 0.5) * 100;
  // Ground level positioning — closer markers appear lower
  const yPct = distance < 10 ? 72 : distance < 30 ? 64 : distance < 80 ? 58 : 54;
  const scale = distance < 10 ? 1.3 : distance < 30 ? 1.0 : distance < 80 ? 0.8 : 0.6;

  return { xPct, yPct, visible: true, scale };
}

const MARKER_INITIALS: Record<string, string> = {
  feeder_pillar: "F",
  charge_point: "E",
  transformer: "T",
  rmu: "R",
  cutout: "C",
  joint: "J",
  pole: "P",
};

export function StreetViewPanel({
  lat,
  lng,
  onClose,
  markers = [],
  onCaptures,
}: StreetViewPanelProps) {
  const { toast } = useToast();
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [captures, setCaptures] = useState<StreetViewCapture[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const imgSrc = `https://maps.googleapis.com/maps/api/streetview?size=${IMG_W}x${IMG_H}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${FOV}&key=${GOOGLE_MAPS_KEY}`;

  // Project markers onto the image
  const projected = markers
    .map((m) => {
      const bearing = calculateBearing(lat, lng, m.lat, m.lng);
      const distance = haversineM(lat, lng, m.lat, m.lng);
      const pos = projectMarker(heading, bearing, distance);
      return { ...m, ...pos, distance };
    })
    .filter((m) => m.visible && m.distance < 200); // Only show markers within 200m

  const handleCapture = useCallback(async () => {
    const angleNum = captures.length + 1;
    if (angleNum > 2) {
      toast({ title: "Maximum 2 captures" });
      return;
    }

    setCapturing(true);
    try {
      // Fetch image via edge function proxy (avoids CORS)
      const { data, error } = await supabase.functions.invoke("street-view-proxy", {
        body: { lat, lng, heading, pitch, fov: FOV, width: IMG_W, height: IMG_H },
      });

      if (error) throw new Error(error.message || "Proxy error");
      if (!data?.image_base64) throw new Error("No image returned");

      // Compose markers on canvas
      const canvas = document.createElement("canvas");
      canvas.width = IMG_W;
      canvas.height = IMG_H;
      const ctx = canvas.getContext("2d")!;

      // Draw the street view image
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

        // White border
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();

        // Coloured fill
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();

        // Initial letter
        ctx.font = `bold ${Math.round(12 * m.scale)}px Arial`;
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(MARKER_INITIALS[m.type] || m.label.charAt(0), x, y);

        // Label below
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
  }, [lat, lng, heading, pitch, captures, projected, onCaptures, toast]);

  return (
    <div className="absolute top-2 right-14 z-20 w-[480px] rounded-xl border bg-background/95 backdrop-blur shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Street View</span>
          {markers.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {projected.length} marker{projected.length !== 1 ? "s" : ""} visible
            </Badge>
          )}
          {captures.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {captures.length}/2 captured
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Image with marker overlays */}
      <div className="relative bg-muted" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <img
          key={imgSrc}
          src={imgSrc}
          className="w-full h-full object-cover"
          alt="Street View"
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(true)}
        />

        {/* Marker overlays */}
        {imgLoaded &&
          projected.map((m, i) => (
            <div
              key={`${m.type}-${i}`}
              className="absolute pointer-events-none flex flex-col items-center"
              style={{
                left: `${m.xPct}%`,
                top: `${m.yPct}%`,
                transform: "translate(-50%, -50%)",
              }}
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
                className="text-white font-semibold mt-0.5"
                style={{
                  fontSize: `${9 * m.scale}px`,
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                }}
              >
                {m.label}
              </span>
            </div>
          ))}
      </div>

      {/* Controls */}
      <div className="px-3 py-2 space-y-2 border-t">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-14">Heading</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setHeading((h) => (h - 30 + 360) % 360);
              setImgLoaded(false);
            }}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Slider
            value={[heading]}
            min={0}
            max={360}
            step={5}
            onValueChange={([v]) => {
              setHeading(v);
              setImgLoaded(false);
            }}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setHeading((h) => (h + 30) % 360);
              setImgLoaded(false);
            }}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-xs font-mono w-8 text-right">{Math.round(heading)}°</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-14">Pitch</span>
          <Slider
            value={[pitch]}
            min={-20}
            max={20}
            step={5}
            onValueChange={([v]) => {
              setPitch(v);
              setImgLoaded(false);
            }}
            className="flex-1"
          />
          <span className="text-xs font-mono w-8 text-right">{pitch}°</span>
        </div>
      </div>

      {/* Capture bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t">
        <span className="text-xs text-muted-foreground">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={capturing || captures.length >= 2}
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
