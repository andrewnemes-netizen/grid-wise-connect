import { useState } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CsvIntakePanel, type SiteRow } from "@/components/la/CsvIntakePanel";
import { ProgrammeDashboard } from "@/components/la/ProgrammeDashboard";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const LaProgramme = () => {
  const { hasRole } = useAuth();
  const isInternal = hasRole("admin") || hasRole("engineer");

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any>(null);

  const handleScore = async (rows: SiteRow[]) => {
    setIsProcessing(true);
    setProgress(10);
    setResults(null);
    setSummary(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please log in"); return; }

      // Chunk client-side to avoid edge function CPU limits on large batches
      const CHUNK_SIZE = 8;
      const chunks: SiteRow[][] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
      }

      const allResults: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const response = await supabase.functions.invoke("score-sites-batch", {
          body: { sites: chunks[i] },
        });
        if (response.error) {
          toast.error(`Chunk ${i + 1}/${chunks.length} failed: ${response.error.message}`);
          return;
        }
        if (response.data?.results) allResults.push(...response.data.results);
        setProgress(10 + Math.round(((i + 1) / chunks.length) * 85));
      }

      const aggregatedSummary = {
        total: allResults.length,
        errors: allResults.filter((r: any) => r.error).length,
        phase_1: allResults.filter((r: any) => r.phase === 1).length,
        phase_2: allResults.filter((r: any) => r.phase === 2).length,
        phase_3: allResults.filter((r: any) => r.phase === 3).length,
      };

      setResults(allResults);
      setSummary(aggregatedSummary);
      setProgress(100);
      toast.success(`Scored ${aggregatedSummary.total} sites (${aggregatedSummary.errors} errors)`);
    } catch (err: any) {
      toast.error(err.message || "Scoring failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-auto">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">LA Programme Engine</h2>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Upload a council site list to batch-score sites, auto-assign deployment phases, and generate a programme export for LEVI/OZEV funding applications.
      </p>

      <CsvIntakePanel onSubmit={handleScore} isProcessing={isProcessing} />

      {isProcessing && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">Scoring sites… this may take a moment for large batches</p>
        </div>
      )}

      {results && summary && (
        <ProgrammeDashboard results={results} summary={summary} isInternal={isInternal} />
      )}
    </div>
  );
};

export default LaProgramme;
