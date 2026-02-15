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

      setProgress(20);

      const response = await supabase.functions.invoke("score-sites-batch", {
        body: { sites: rows },
      });

      setProgress(90);

      if (response.error) {
        toast.error(`Scoring failed: ${response.error.message}`);
        return;
      }

      const data = response.data;
      setResults(data.results);
      setSummary(data.summary);
      setProgress(100);
      toast.success(`Scored ${data.summary.total} sites (${data.summary.errors} errors)`);
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
