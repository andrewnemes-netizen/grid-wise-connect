import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SURVEY_SECTIONS, collectRowsForPdf, type SurveyField } from "@/lib/survey-schema";
import { generateSurveyPdf } from "@/lib/survey-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Upload, X } from "lucide-react";

type Survey = {
  survey_id: string;
  site_id: string;
  site_name: string;
  postcode: string | null;
  status: string;
  expires_at: string;
  sent_to_email: string;
  sent_to_name: string | null;
};

export default function SurveyForm() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ pdfUrl?: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_survey_by_token", { _token: token });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        setInvalid("This survey link is invalid, expired or has already been completed.");
      } else {
        setSurvey(row as Survey);
        setValues({
          submitter_email: row.sent_to_email ?? "",
          submitter_name: row.sent_to_name ?? "",
        });
      }
      setLoading(false);
    })();
  }, [token]);

  const setValue = (k: string, v: any) => setValues((prev) => ({ ...prev, [k]: v }));
  const totalSteps = SURVEY_SECTIONS.length;
  const current = SURVEY_SECTIONS[step];

  const canNext = useMemo(() => {
    return current.fields.every((f) => {
      if (!f.required) return true;
      if (f.type === "signature") return !!signatureUrl;
      const v = values[f.key];
      return v !== undefined && v !== "" && v !== null;
    });
  }, [current, values, signatureUrl]);

  const uploadFile = async (file: Blob, path: string, contentType: string) => {
    const { error } = await supabase.storage
      .from("site-surveys")
      .upload(path, file, { contentType, upsert: false });
    if (error) throw error;
    const { data } = await supabase.storage.from("site-surveys").getPublicUrl(path);
    // Bucket is private; use signed URL for reliable access
    const { data: signed } = await supabase.storage
      .from("site-surveys")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!survey || !token) return;
    setSubmitting(true);
    try {
      // 1) Upload photos
      const imageUrls: string[] = [];
      for (let i = 0; i < photoFiles.length; i++) {
        const f = photoFiles[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${survey.survey_id}/photos/${Date.now()}-${i}.${ext}`;
        const url = await uploadFile(f, path, f.type || "image/jpeg");
        imageUrls.push(url);
      }

      // 2) Upload signature
      let sigUrl: string | null = null;
      if (signatureUrl) {
        const blob = await (await fetch(signatureUrl)).blob();
        sigUrl = await uploadFile(blob, `${survey.survey_id}/signature.png`, "image/png");
      }

      // 3) Generate PDF client-side
      const pdfBlob = await generateSurveyPdf({
        siteName: survey.site_name,
        postcode: survey.postcode ?? undefined,
        submitterName: values.submitter_name,
        submitterEmail: values.submitter_email,
        submittedAt: new Date(),
        sections: collectRowsForPdf(values),
        images: imageUrls,
        signatureDataUrl: signatureUrl ?? undefined,
      });
      const pdfPath = `${survey.survey_id}/survey.pdf`;
      const pdfUrl = await uploadFile(pdfBlob, pdfPath, "application/pdf");

      // 4) RPC submit
      const { data: responseId, error: rpcErr } = await supabase.rpc("submit_survey_by_token", {
        _token: token,
        _submission: values,
        _signature_url: sigUrl,
        _image_urls: imageUrls,
        _pdf_url: pdfUrl,
        _submitter_name: values.submitter_name ?? null,
        _submitter_email: values.submitter_email ?? null,
      });
      if (rpcErr) throw rpcErr;

      // 5) Notify owner
      await supabase.functions.invoke("notify-survey-submitted", {
        body: {
          token,
          response_id: responseId,
          pdf_url: pdfUrl,
          submitter_name: values.submitter_name,
          submitter_email: values.submitter_email,
          overall_status: values.overall_status,
          app_base_url: window.location.origin,
        },
      });

      setDone({ pdfUrl });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to submit survey");
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

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-2">
            <h1 className="text-lg font-semibold">Link Unavailable</h1>
            <p className="text-sm text-muted-foreground">{invalid}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Thank you!</h1>
            <p className="text-sm text-muted-foreground">
              Your site survey has been submitted. A copy has been shared with the requester.
            </p>
            {done.pdfUrl && (
              <Button asChild variant="outline">
                <a href={done.pdfUrl} target="_blank" rel="noreferrer">Download my PDF copy</a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">On-Street / Public Car Park Site Survey</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {survey?.site_name}{survey?.postcode ? ` — ${survey.postcode}` : ""}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 text-xs">
          {SURVEY_SECTIONS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center font-semibold ${
                  i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/40 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >{i + 1}</div>
              {i < SURVEY_SECTIONS.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="font-semibold text-lg">{current.title}</h2>
            {current.fields.map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                value={values[f.key]}
                onChange={(v) => setValue(f.key, v)}
                photoFiles={photoFiles}
                onPhotos={setPhotoFiles}
                signatureUrl={signatureUrl}
                onSignature={setSignatureUrl}
              />
            ))}

            <div className="flex items-center justify-between pt-4">
              <Button
                variant="outline"
                disabled={step === 0 || submitting}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >Back</Button>
              <div className="text-xs text-muted-foreground">{step + 1} / {totalSteps}</div>
              {step < totalSteps - 1 ? (
                <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Button>
              ) : (
                <Button disabled={!canNext || submitting} onClick={handleSubmit}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FieldRow({
  field, value, onChange, photoFiles, onPhotos, signatureUrl, onSignature,
}: {
  field: SurveyField;
  value: any;
  onChange: (v: any) => void;
  photoFiles: File[];
  onPhotos: (files: File[]) => void;
  signatureUrl: string | null;
  onSignature: (url: string | null) => void;
}) {
  const id = `f-${field.key}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label} {field.required && <span className="text-destructive">*</span>}
      </Label>
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      {field.type === "text" && (
        <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "number" && (
        <Input id={id} type="number" inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      )}
      {field.type === "textarea" && (
        <Textarea id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} />
      )}
      {field.type === "yesno" && (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger id={id}><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
            <SelectItem value="Unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      )}
      {field.type === "select" && (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger id={id}><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.type === "image" && (
        <PhotoInput files={photoFiles} onChange={onPhotos} />
      )}
      {field.type === "signature" && (
        <SignaturePad value={signatureUrl} onChange={onSignature} />
      )}
    </div>
  );
}

function PhotoInput({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          onChange([...files, ...list]);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="h-3 w-3 mr-1" /> Add photos
      </Button>
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => {
            const url = URL.createObjectURL(f);
            return (
              <div key={i} className="relative aspect-square rounded border overflow-hidden">
                <img src={url} alt={f.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SignaturePad({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const url = canvasRef.current!.toDataURL("image/png");
    onChange(url);
  };

  const clear = useCallback(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        className="w-full aspect-[10/3] border rounded bg-white touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{value ? "Signed" : "Sign above using your finger, stylus or mouse"}</span>
        <button type="button" onClick={clear} className="text-primary hover:underline">Clear</button>
      </div>
    </div>
  );
}