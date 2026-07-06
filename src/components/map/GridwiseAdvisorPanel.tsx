import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Download, MapPin, Zap, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export interface AdvisorResult {
  asset_type: string;
  source_table: string;
  id: string;
  name: string | null;
  dno: string | null;
  voltage_kv: number | null;
  headroom_kw: number | null;
  utilisation_pct: number | null;
  local_authority: string | null;
  distance_m: number;
  lat: number;
  lng: number;
  score: number;
}

interface Msg { role: "user" | "assistant"; content: string; }

interface Props {
  onClose: () => void;
  onShowOnMap: (results: AdvisorResult[]) => void;
  onAssess: (r: AdvisorResult) => void;
}

const SUGGESTIONS = [
  "Find substations within 5km of Leeds city centre with 200kW+ headroom",
  "Show LV substations near Cambridge that are less than 60% loaded",
  "Rank the top 20 EV hub locations near Manchester",
  "Find 11kV substations in Camden with spare capacity",
];

export function GridwiseAdvisorPanel({ onClose, onShowOnMap, onAssess }: Props) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm the Gridwise Advisor. Ask me to find substations, feeders, or EV hub locations anywhere in the UK. I'll query the network and rank matches.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AdvisorResult[]>([]);
  const [resolvedLocation, setResolvedLocation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const nextMessages: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gridwise-advisor", {
        body: { messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply: Msg = { role: "assistant", content: data?.text ?? "(no reply)" };
      setMessages([...nextMessages, reply]);
      const r = data?.results;
      if (r?.results?.length) {
        setResults(r.results);
        setResolvedLocation(r.query?.resolved_location?.label ?? null);
        onShowOnMap(r.results);
      } else if (r && r.total === 0) {
        setResults([]);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      toast.error(`Advisor error: ${msg}`);
      setMessages([...nextMessages, { role: "assistant", content: `Sorry — ${msg}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, loading, onShowOnMap]);

  const exportExcel = () => {
    if (!results.length) return;
    const rows = results.map((r) => ({
      Rank: r.score,
      Type: r.asset_type,
      Name: r.name ?? "",
      DNO: r.dno ?? "",
      "Voltage (kV)": r.voltage_kv ?? "",
      "Headroom (kW)": r.headroom_kw ?? "",
      "Utilisation (%)": r.utilisation_pct ?? "",
      "Local Authority": r.local_authority ?? "",
      "Distance (m)": r.distance_m,
      Lat: r.lat, Lng: r.lng,
      Source: r.source_table,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gridwise Advisor");
    XLSX.writeFile(wb, `gridwise-advisor-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${rows.length} assets`);
  };

  const createStudyShortlist = () => {
    if (!results.length) return;
    const top = results.slice(0, 10);
    localStorage.setItem("advisor_shortlist", JSON.stringify(top));
    toast.success(`Saved top ${top.length} to shortlist — open Studies to create.`);
    navigate("/studies");
  };

  return (
    <div className="absolute top-14 right-3 bottom-3 z-30 w-[420px] max-w-[92vw] flex flex-col rounded-lg border bg-background/98 backdrop-blur shadow-xl">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight">Gridwise Advisor</div>
          <div className="text-[10px] text-muted-foreground leading-tight">AI grid site finder</div>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef as any}>
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={
                m.role === "user"
                  ? "max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                  : "text-sm text-foreground whitespace-pre-wrap"
              }>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching network…
            </div>
          )}

          {results.length > 0 && (
            <Card className="mt-2 p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">
                  {results.length} matches{resolvedLocation ? ` near ${resolvedLocation.split(",")[0]}` : ""}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={exportExcel}>
                    <Download className="h-3 w-3 mr-1" />Excel
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={createStudyShortlist}>
                    Shortlist
                  </Button>
                </div>
              </div>
              <div className="max-h-[280px] overflow-auto divide-y">
                {results.map((r, i) => (
                  <div key={`${r.source_table}-${r.id}-${i}`} className="py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{r.name ?? "(unnamed)"}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{r.asset_type}</Badge>
                          {r.dno && <Badge variant="secondary" className="text-[9px] px-1 py-0">{r.dno}</Badge>}
                          {r.voltage_kv != null && <span className="text-[10px] text-muted-foreground">{r.voltage_kv}kV</span>}
                          {r.headroom_kw != null && <span className="text-[10px] text-emerald-600">{Math.round(r.headroom_kw)}kW headroom</span>}
                          {r.utilisation_pct != null && <span className="text-[10px] text-amber-600">{Math.round(r.utilisation_pct)}% util</span>}
                          <span className="text-[10px] text-muted-foreground">{(r.distance_m/1000).toFixed(2)}km</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Fly to on map"
                          onClick={() => onShowOnMap([r])}>
                          <MapPin className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Assess this location"
                          onClick={() => onAssess(r)}>
                          <Zap className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {messages.length === 1 && !loading && (
            <div className="mt-3 space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Try</div>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full text-left text-xs rounded border px-2 py-1.5 hover:bg-accent">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <form className="border-t p-2 flex gap-1"
        onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Ask about substations, headroom, feeders…"
          className="flex-1 resize-none rounded border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={loading}
        />
        <Button size="icon" type="submit" className="h-auto w-9" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}