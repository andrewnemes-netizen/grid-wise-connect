import { useState, useCallback } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PostcodeSearchProps {
  onResult: (lng: number, lat: number, label: string) => void;
}

export function PostcodeSearch({ onResult }: PostcodeSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=${encodeURIComponent(query)}&limit=5`,
        { headers: { "User-Agent": "EcoPowerFeasibility/1.0" } }
      );
      const data = await res.json();
      setResults(data);
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

  const handleSelect = (r: { display_name: string; lat: string; lon: string }) => {
    onResult(parseFloat(r.lon), parseFloat(r.lat), r.display_name);
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
            placeholder="Search postcode or address…"
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
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
