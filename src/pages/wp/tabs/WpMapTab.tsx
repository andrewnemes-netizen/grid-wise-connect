import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Row = {
  site_id: string;
  sites: {
    id: string;
    site_name: string;
    postcode: string | null;
    raw_score_data: any;
  } | null;
};

function extractLatLng(raw: any): [number, number] | null {
  if (!raw || typeof raw !== "object") return null;
  const lat = Number(raw.lat ?? raw.latitude);
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lng, lat];
}

export default function WpMapTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const { data: rows = [] } = useQuery({
    queryKey: ["wp-map-sites", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select("site_id, sites:sites(id, site_name, postcode, raw_score_data)")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const points = useMemo(() => {
    return rows
      .map((r) => {
        const coords = extractLatLng(r.sites?.raw_score_data);
        if (!coords || !r.sites) return null;
        return { id: r.sites.id, name: r.sites.site_name, postcode: r.sites.postcode, coords };
      })
      .filter(Boolean) as { id: string; name: string; postcode: string | null; coords: [number, number] }[];
  }, [rows]);

  const missingCount = rows.length - points.length;

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [-2.5, 54.0],
      zoom: 5.2,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (points.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => {
      const el = document.createElement("button");
      el.className = "wp-map-pin";
      el.style.cssText = "width:14px;height:14px;border-radius:9999px;background:hsl(var(--primary));border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.35);cursor:pointer;";
      el.title = `${p.name}${p.postcode ? ` — ${p.postcode}` : ""}`;
      el.onclick = () => navigate(`/site/${p.id}`);

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div style="font-family:inherit;font-size:12px;padding:2px 4px;">
          <div style="font-weight:600;">${p.name.replace(/</g, "&lt;")}</div>
          ${p.postcode ? `<div style="opacity:0.7;">${p.postcode}</div>` : ""}
          <div style="margin-top:4px;opacity:0.7;">Click pin to open site →</div>
        </div>`
      );
      const marker = new maplibregl.Marker({ element: el }).setLngLat(p.coords).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
      bounds.extend(p.coords);
    });

    const doFit = () => {
      if (points.length === 1) {
        map.easeTo({ center: points[0].coords, zoom: 13, duration: 600 });
      } else {
        map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 });
      }
    };
    if (map.loaded()) doFit();
    else map.once("load", doFit);
  }, [points, navigate]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Geographic view of the {rows.length} site{rows.length === 1 ? "" : "s"} in this work package.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{points.length} mapped</Badge>
          {missingCount > 0 && <Badge variant="outline">{missingCount} without coords</Badge>}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div ref={containerRef} className="h-[70vh] w-full rounded-md overflow-hidden" />
        </CardContent>
      </Card>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No sites allocated to this work package yet.</p>
      )}
    </div>
  );
}