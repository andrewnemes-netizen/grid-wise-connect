import { useState, useCallback } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { bngToWgs84 } from "@/lib/bngToWgs84";

const OS_API_KEY = "j7vwIPqoPOj5tiwNsJGlQ1SDD2GpsehD";

interface SearchResult {
  display_name: string;
  lat: number;
  lng: number;
  type?: string;
}

interface PostcodeSearchProps {
  onResult: (lng: number, lat: number, label: string) => void;
}

export function PostcodeSearch({ onResult }: PostcodeSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      // Try OS Names API first (UK-specific, high quality)
      const osResults = await searchOSNames(query.trim());
      if (osResults.length > 0) {
        setResults(osResults);
        setOpen(true);
        setLoading(false);
        return;
      }

      // Fallback to Nominatim for international/edge cases
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=${encodeURIComponent(query)}&limit=5`,
        { headers: { "User-Agent": "EcoPowerFeasibility/1.0" } }
      );
      const data = await res.json();
      setResults(
        data.map((r: any) => ({
          display_name: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: "nominatim",
        }))
      );
      setOpen(data.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  const handleSelect = (r: SearchResult) => {
    onResult(r.lng, r.lat, r.display_name);
    setQuery(r.display_name.split(",")[0]);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="absolute top-3 left-3 z-10 w-80">
      <div className="flex gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search postcode, place or address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9 bg-background/95 backdrop-blur shadow-md border-border"
          />
        </div>
        <Button size="icon" variant="secondary" onClick={search} disabled={loading} className="shadow-md">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        </Button>
      </div>

      {open && results.length > 0 && (
        <div className="mt-1 rounded-md border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors truncate"
            >
              <span className="font-medium">{r.display_name.split(",")[0]}</span>
              {r.display_name.includes(",") && (
                <span className="text-muted-foreground text-xs ml-1">
                  {r.display_name.substring(r.display_name.indexOf(",") + 1).trim()}
                </span>
              )}
              {r.type && (
                <span className="text-[9px] text-muted-foreground ml-1 uppercase">
                  {r.type}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function searchOSNames(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.os.uk/search/names/v1/find?query=${encodeURIComponent(query)}&maxresults=8&key=${OS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    
    const entries = data.results || [];
    return entries
      .map((r: any) => {
        const entry = r.GAZETTEER_ENTRY;
        if (!entry) return null;
        
        const { lat, lng } = bngToWgs84(entry.GEOMETRY_X, entry.GEOMETRY_Y);
        const localType = entry.LOCAL_TYPE || "";
        const county = entry.COUNTY_UNITARY || entry.REGION || "";
        const district = entry.DISTRICT_BOROUGH || "";
        
        const parts = [entry.NAME1];
        if (district && district !== entry.NAME1) parts.push(district);
        if (county && county !== district) parts.push(county);
        
        return {
          display_name: parts.join(", "),
          lat,
          lng,
          type: localType.toLowerCase(),
        } as SearchResult;
      })
      .filter(Boolean) as SearchResult[];
  } catch {
    return [];
  }
}
