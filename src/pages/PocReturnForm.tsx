import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCircle2, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { extractPdfText } from "@/lib/import/documentText";

type ReturnInfo = {
  return_id: string;
  po_id: string;
  po_number: string | null;
  status: string;
  expires_at: string;
  work_package_name: string | null;
  client_name: string | null;
};

export default function PocReturnForm() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ReturnInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("get_poc_return_by_token", { _token: token });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) { setError("This upload link is invalid."); setLoading(false); return; }
      if (row.status === "submitted") { setError("This POC return has already been submitted. Thank you."); }
      else if (row.status === "revoked") { setError("This upload link has been revoked by the issuing team."); }
      else if (new Date(row.expires_at).getTime() < Date.now()) { setError("This upload link has expired."); }
      setInfo(row);
      setLoading(false);
    })();
  }, [token]);

  const onPick = (fl: FileList | null) => {
    if (!fl) return;
    const arr = Array.from(fl).filter(f => {
      const n = f.name.toLowerCase();
      return n.endsWith(".pdf") || n.endsWith(".xlsx") || n.endsWith(".xlsm");
    });
    if (arr.length !== fl.length) toast.warning("Only .pdf, .xlsx and .xlsm files are accepted");
    setFiles(prev => [...prev, ...arr]);
  };

  const submit = async () => {
    if (!token || !info || files.length === 0) return;
    setSubmitting(true);
    try {
      const XLSX = await import("xlsx");
      const payloadFiles: any[] = [];

      for (const f of files) {
        const lower = f.name.toLowerCase();
        const isPdf = lower.endsWith(".pdf");
        const isXlsm = lower.endsWith(".xlsm");
        const fileType = isPdf ? "pdf" : isXlsm ? "xlsm" : "xlsx";
        const storagePath = `${info.return_id}/${crypto.randomUUID()}-${f.name}`;

        // 1. Upload raw file
        const { error: upErr } = await supabase.storage
          .from("poc-designer-returns")
          .upload(storagePath, f, { contentType: f.type || undefined, upsert: false });
        if (upErr) throw upErr;

        // 2. Parse client-side for AI extraction
        let parsed: any = null;
        try {
          if (isPdf) {
            parsed = await extractPdfText(f);
          } else {
            const buf = await f.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const sheets: Record<string, unknown[]> = {};
            for (const name of wb.SheetNames) {
              sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
            }
            parsed = sheets;
          }
        } catch (e) {
          console.warn("Client-side parse failed:", e);
        }

        payloadFiles.push({
          file_type: fileType,
          storage_path: storagePath,
          original_filename: f.name,
          parsed_content: parsed,
        });
      }

      const { error: subErr } = await supabase.rpc("submit_poc_return_by_token", {
        _token: token, _files: payloadFiles,
      });
      if (subErr) throw subErr;

      setDone(true);
      toast.success("Submission received");
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center space-y-2">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
            <CardTitle>Submission received</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Thank you. The EcoPower Energy team will review your submission and be in touch.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center space-y-2">
            <XCircle className="h-12 w-12 mx-auto text-rose-500" />
            <CardTitle>Unable to submit</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-10">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">EcoPower Energy</div>
          <h1 className="text-2xl font-semibold">Upload your POC submission</h1>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Purchase order</div>
                <CardTitle className="text-lg">{info?.po_number ?? "—"}</CardTitle>
              </div>
              <Badge variant="outline">Pending</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {info?.client_name && <div><span className="text-muted-foreground">Client:</span> <span className="font-medium">{info.client_name}</span></div>}
            {info?.work_package_name && <div><span className="text-muted-foreground">Work package:</span> <span className="font-medium">{info.work_package_name}</span></div>}
            <div><span className="text-muted-foreground">Link expires:</span> {new Date(info!.expires_at).toLocaleDateString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="poc-files">Upload PDF, XLSX or XLSM (rate schedule)</Label>
              <Input
                id="poc-files"
                type="file"
                multiple
                accept=".pdf,.xlsx,.xlsm,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel,*/*"
                onChange={(e) => onPick(e.target.files)}
              />
            </div>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    >Remove</Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              className="w-full"
              disabled={files.length === 0 || submitting}
              onClick={submit}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Submit {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"}` : ""}
            </Button>
            <p className="text-xs text-muted-foreground">
              Uploads are private to EcoPower Energy. You will not be able to change your submission after sending.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}