import { useState, useCallback } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface SearchResult {
  label: string;
  lat: number;
  lng: number;
  type: string;
  source: string;
  uprn: string | null;
  postcode: string | null;
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
      // Use unified geocoder edge function
      const geocoderResults = await searchGeocoder(query.trim());
      if (geocoderResults.length > 0) {
        setResults(geocoderResults);
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
          label: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: "nominatim",
          source: "nominatim",
          uprn: null,
          postcode: null,
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
    onResult(r.lng, r.lat, r.label);
    setQuery(r.label.split(",")[0]);
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
              <span className="font-medium">{r.label.split(",")[0]}</span>
              {r.label.includes(",") && (
                <span className="text-muted-foreground text-xs ml-1">
                  {r.label.substring(r.label.indexOf(",") + 1).trim()}
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

async function searchGeocoder(query: string): Promise<SearchResult[]> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return [];

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocoder?q=${encodeURIComponent(query)}&limit=8`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });

    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map((r: any) => ({
      label: r.label,
      lat: r.lat,
      lng: r.lng,
      type: r.type || "",
      source: r.source || "",
      uprn: r.uprn || null,
      postcode: r.postcode || null,
    }));
  } catch {
    return [];
  }
}
