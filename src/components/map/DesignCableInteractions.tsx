import { useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import { Pencil, Trash2, Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DesignCable, DesignElement } from "@/hooks/useDesignMode";
import { CABLE_CONFIG } from "@/hooks/useDesignMode";
import { selectCableForLoad } from "@/lib/connectionCosts";
import { elementKva, EVCP_DEFAULT_AMPS } from "@/lib/designLoadCalc";

interface DesignCableInteractionsProps {
  map: maplibregl.Map | null;
  cables: DesignCable[];
  elements: DesignElement[];
  /** Only mount listeners while Design Mode is active. */
  active: boolean;
  onRemoveCable: (id: string) => void;
  onUpdateCableProperties: (id: string, patch: Record<string, unknown>) => Promise<void>;
}

/**
 * Computes the connected EVCP load (amps) for a cable based on its `to_id`.
 * Falls back to the FlowEmo-style default of 80 A for a 55 kVA charger.
 */
function neededAmpsFor(cable: DesignCable, elements: DesignElement[]): number {
  const props = (cable.properties_json ?? {}) as { to_id?: string; needed_amps?: number };
  if (typeof props.needed_amps === "number" && props.needed_amps > 0) return props.needed_amps;
  const target = props.to_id ? elements.find((el) => el.id === props.to_id) : null;
  if (!target) return EVCP_DEFAULT_AMPS;
  const kva = elementKva(target);
  if (kva <= 0) return EVCP_DEFAULT_AMPS;
  // I = S / (√3 · 400 V)
  return Math.round((kva * 1000) / (Math.sqrt(3) * 400));
}

/**
 * Click-to-edit interactions for design cables.
 *
 * - Single MapLibre popup acts as the FlowEmo "edit / split" pill.
 * - Edit opens a side sheet bound to `properties_json`.
 */
export function DesignCableInteractions({
  map,
  cables,
  elements,
  active,
  onRemoveCable,
  onUpdateCableProperties,
}: DesignCableInteractionsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? cables.find((c) => c.id === editingId) ?? null : null;

  // Local form state mirrors `editing.properties_json` for instant feedback.
  const [form, setForm] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!editing) return;
    setForm({ ...(editing.properties_json ?? {}) });
  }, [editing]);

  // Wire map clicks on every design-cable layer to a popup.
  useEffect(() => {
    if (!map || !active) return;
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 10,
      maxWidth: "260px",
    });
    const handlers: Array<{ layerId: string; handler: (e: maplibregl.MapLayerMouseEvent) => void }> = [];

    cables.forEach((cable) => {
      const layerId = `design-cable-${cable.id}`;
      if (!map.getLayer(layerId)) return;
      const handler = (e: maplibregl.MapLayerMouseEvent) => {
        e.originalEvent.stopPropagation();
        const props = (cable.properties_json ?? {}) as {
          from_id?: string; to_id?: string;
        };
        const fromEl = props.from_id ? elements.find((el) => el.id === props.from_id) : null;
        const toEl = props.to_id ? elements.find((el) => el.id === props.to_id) : null;
        const fromLabel = fromEl?.label ?? "POC";
        const toLabel = toEl?.label ?? "Load";
        const amps = neededAmpsFor(cable, elements);
        const cfg = CABLE_CONFIG[cable.cable_type] ?? CABLE_CONFIG.lv_main;

        const node = document.createElement("div");
        node.style.cssText = "min-width:220px;font-family:ui-sans-serif,system-ui;";
        node.innerHTML = `
          <div style="background:${cfg.color};color:#fff;border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.25);font-size:10px;">⚡</span>
            <span style="flex:1;">${fromLabel} → ${toLabel}</span>
          </div>
          <div style="font-size:11px;color:#555;padding:6px 2px 8px;">
            AC · <strong>${amps.toFixed(2)} A</strong> · ${cable.length_m.toFixed(2)} m
          </div>
          <div style="display:flex;gap:6px;">
            <button data-act="edit" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:11px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;">✏️ Edit</button>
            <button data-act="del" style="flex:1;padding:6px;border:1px solid #fecaca;border-radius:6px;font-size:11px;background:#fff;color:#b91c1c;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;">🗑 Remove</button>
          </div>
        `;
        node.addEventListener("click", (ev) => {
          const t = ev.target as HTMLElement;
          const act = t.closest("button")?.getAttribute("data-act");
          if (act === "edit") {
            popup.remove();
            setEditingId(cable.id);
          } else if (act === "del") {
            popup.remove();
            void onRemoveCable(cable.id);
          }
        });

        popup
          .setLngLat(e.lngLat)
          .setDOMContent(node)
          .addTo(map);
      };
      map.on("click", layerId, handler);
      handlers.push({ layerId, handler });
      // Hover affordance.
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    });

    return () => {
      handlers.forEach(({ layerId, handler }) => {
        try { map.off("click", layerId, handler); } catch {/* layer may have been removed */}
      });
      popup.remove();
    };
  }, [map, active, cables, elements, onRemoveCable]);

  // ── Sizing helpers ──────────────────────────────────────────────
  const amps = editing ? neededAmpsFor(editing, elements) : 0;
  // Convert phase amps → kW (assuming 400 V three-phase, 0.95 pf).
  const kw = editing ? Math.round((amps * 400 * Math.sqrt(3) * 0.95) / 1000) : 0;
  const recommended = editing && kw > 0 ? selectCableForLoad(kw, "LV") : null;

  return (
    <Sheet
      open={!!editing}
      onOpenChange={(open) => {
        if (!open) setEditingId(null);
      }}
    >
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {editing && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base">
                {editing.label ?? "Cable"} — {editing.length_m.toFixed(2)} m
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1.5 text-xs">
                <Zap className="h-3 w-3 text-amber-500" />
                Needed Ampere: <strong className="font-mono">{amps.toFixed(2)} A</strong>
                {recommended && (
                  <span className="text-muted-foreground">
                    · suggested {recommended.cable_type}
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="cable-name" className="text-xs">Name</Label>
                <Input
                  id="cable-name"
                  value={(form.name as string) ?? editing.label ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Cable Type</Label>
                <Select
                  value={(form.cable_spec as string) ?? recommended?.cable_type ?? ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, cable_spec: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select cable" /></SelectTrigger>
                  <SelectContent>
                    {recommended && (
                      <SelectItem value={recommended.cable_type}>
                        {recommended.cable_type} — {recommended.current_rating_a} A
                      </SelectItem>
                    )}
                    <SelectItem value="35mm² CNE Al">35mm² CNE Al (LV service)</SelectItem>
                    <SelectItem value="95mm² 4c XLPE/SWA">95mm² 4c XLPE/SWA</SelectItem>
                    <SelectItem value="185mm² 4c XLPE/SWA">185mm² 4c XLPE/SWA</SelectItem>
                    <SelectItem value="240mm² 4c XLPE/SWA">240mm² 4c XLPE/SWA</SelectItem>
                    <SelectItem value="300mm² 4c XLPE/SWA">300mm² 4c XLPE/SWA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="extra-length" className="text-xs">Extra Length (m)</Label>
                  <Input
                    id="extra-length"
                    type="number"
                    min={0}
                    value={(form.extra_length_m as number) ?? 3}
                    onChange={(e) => setForm((f) => ({ ...f, extra_length_m: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="extra-pips" className="text-xs">Extra Pips</Label>
                  <Input
                    id="extra-pips"
                    type="number"
                    min={0}
                    value={(form.extra_pips as number) ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, extra_pips: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold mb-2">Fields for calculating dimensions</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Material</Label>
                    <Select
                      value={(form.material as string) ?? "Aluminium"}
                      onValueChange={(v) => setForm((f) => ({ ...f, material: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Copper">Copper</SelectItem>
                        <SelectItem value="Aluminium">Aluminium</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="power-circuits" className="text-xs">Power Circuits</Label>
                    <Input
                      id="power-circuits"
                      type="number"
                      min={1}
                      value={(form.power_circuits as number) ?? 1}
                      onChange={(e) => setForm((f) => ({ ...f, power_circuits: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Separation</Label>
                    <Select
                      value={(form.separation as string) ?? "one_diameter"}
                      onValueChange={(v) => setForm((f) => ({ ...f, separation: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="touching">Touching</SelectItem>
                        <SelectItem value="one_diameter">One cable diameter</SelectItem>
                        <SelectItem value="two_diameters">Two cable diameters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Thermal Resistance</Label>
                    <Select
                      value={String((form.thermal_resistance as number) ?? 1.5)}
                      onValueChange={(v) => setForm((f) => ({ ...f, thermal_resistance: Number(v) }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0.5, 0.7, 1.0, 1.5, 2.0, 2.5, 3.0].map((v) => (
                          <SelectItem key={v} value={String(v)}>{v.toFixed(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cable in Soil</Label>
                    <Select
                      value={(form.soil_install as string) ?? "free_in_soil"}
                      onValueChange={(v) => setForm((f) => ({ ...f, soil_install: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free_in_soil">Free in Soil</SelectItem>
                        <SelectItem value="enclosed_pipe">Enclosed Pipe in Soil</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Isolation Type</Label>
                    <Select
                      value={(form.isolation as string) ?? "XLPE"}
                      onValueChange={(v) => setForm((f) => ({ ...f, isolation: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="XLPE">XLPE</SelectItem>
                        <SelectItem value="PVC">PVC</SelectItem>
                        <SelectItem value="EPR">EPR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void onRemoveCable(editing.id);
                  setEditingId(null);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
              <Button
                onClick={async () => {
                  await onUpdateCableProperties(editing.id, form);
                  setEditingId(null);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" /> Save and close
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}