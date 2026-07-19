import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  SURVEY_SECTIONS,
  SURFACE_TYPES,
  collectRowsForPdf,
  computeTotalSockets,
  sumComposite,
  type SurveyField,
  type CompositeDistanceValue,
} from "@/lib/survey-schema";
import { generateSurveyPdf, type SurveyPhotoGroup } from "@/lib/survey-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Upload, X, Plus, ExternalLink } from "lucide-react";

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
  // Photos are stored per field key as { files, captions }.
  const [photoGroups, setPhotoGroups] = useState<Record<string, { files: File[]; captions: string[] }>>({});
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
        // Mark this survey as opened (best-effort; token-scoped RPC, no auth required)
        void (async () => {
          try { await supabase.rpc("mark_survey_opened" as any, { _token: token }); } catch { /* ignore */ }
        })();
        const [firstName, ...rest] = (row.sent_to_name ?? "").trim().split(/\s+/);
        setValues({
          submitter_email: row.sent_to_email ?? "",
          first_name: firstName ?? "",
          last_name: rest.join(" ") || "",
          site_name_address: [row.site_name, row.postcode].filter(Boolean).join(", "),
          site_survey_date: new Date().toISOString().slice(0, 16),
        });
      }
      setLoading(false);
    })();
  }, [token]);

  // Prevent search engines from indexing external survey links.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const setValue = (k: string, v: any) =>
    setValues((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "evcp_dual_qty" || k === "evcp_single_qty") {
        next.total_sockets = computeTotalSockets(next);
      }
      return next;
    });
  const totalSteps = SURVEY_SECTIONS.length;
  const current = SURVEY_SECTIONS[step];

  const canNext = useMemo(() => {
    return current.fields.every((f) => {
      if (!f.required) return true;
      if (f.type === "signature") return !!signatureUrl;
      if (f.type === "photo_group") return (photoGroups[f.key]?.files.length ?? 0) > 0;
      if (f.type === "static") return true;
      if (f.type === "composite_distance") {
        const v = values[f.key] as CompositeDistanceValue | undefined;
        return !!v && v.rows?.some((r) => r.distance !== null && r.distance !== undefined && (r.distance as any) !== "");
      }
      const v = values[f.key];
      return v !== undefined && v !== "" && v !== null;
    });
  }, [current, values, signatureUrl, photoGroups]);

  const uploadFile = async (file: Blob, path: string, contentType: string) => {
    const { error } = await supabase.storage
      .from("site-surveys")
      .upload(path, file, { contentType, upsert: true });
    if (error) throw error;
    const { data } = await supabase.storage.from("site-surveys").getPublicUrl(path);
    // Bucket is private; use signed URL for reliable access
    const { data: signed } = await supabase.storage
      .from("site-surveys")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? data.publicUrl;
  };

  const uniqueSurveyPath = (fileName: string) => {
    if (!survey) return fileName;
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    const dot = fileName.lastIndexOf(".");
    const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot >= 0 ? fileName.slice(dot) : "";
    return `${survey.survey_id}/${base}-${suffix}${ext}`;
  };

  const handleSubmit = async () => {
    if (!survey || !token) return;
    setSubmitting(true);
    try {
      // 1) Upload photos (per group)
      const uploadedGroups: SurveyPhotoGroup[] = [];
      const flatImageUrls: string[] = [];
      for (const section of SURVEY_SECTIONS) {
        for (const field of section.fields) {
          if (field.type !== "photo_group") continue;
          const group = photoGroups[field.key];
          if (!group || !group.files.length) continue;
          const photos: { url: string; caption?: string }[] = [];
          for (let i = 0; i < group.files.length; i++) {
            const f = group.files[i];
            const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${survey.survey_id}/${field.key}/${Date.now()}-${crypto.randomUUID()}-${i}.${ext}`;
            const url = await uploadFile(f, path, f.type || "image/jpeg");
            photos.push({ url, caption: group.captions[i] || undefined });
            flatImageUrls.push(url);
          }
          uploadedGroups.push({ key: field.key, title: field.label, photos });
        }
      }

      // 2) Upload signature
      let sigUrl: string | null = null;
      if (signatureUrl) {
        const blob = await (await fetch(signatureUrl)).blob();
        sigUrl = await uploadFile(blob, uniqueSurveyPath("signature.png"), "image/png");
      }

      // 3) Generate PDF client-side
      const submitterName = [values.first_name, values.last_name].filter(Boolean).join(" ").trim();
      const pdfBlob = await generateSurveyPdf({
        siteName: survey.site_name,
        postcode: survey.postcode ?? undefined,
        submitterName,
        submitterEmail: values.submitter_email,
        submittedAt: new Date(),
        sections: collectRowsForPdf(values),
        photoGroups: uploadedGroups,
        signatureDataUrl: signatureUrl ?? undefined,
        relevantDno: values.relevant_dno,
        surveyDate: values.site_survey_date,
      });
      const pdfPath = uniqueSurveyPath("survey.pdf");
      const pdfUrl = await uploadFile(pdfBlob, pdfPath, "application/pdf");

      // 4) RPC submit
      const { data: responseId, error: rpcErr } = await supabase.rpc("submit_survey_by_token", {
        _token: token,
        _submission: { ...values, _photo_groups: uploadedGroups } as any,
        _signature_url: sigUrl,
        _image_urls: flatImageUrls,
        _pdf_url: pdfUrl,
        _submitter_name: submitterName || null,
        _submitter_email: values.submitter_email ?? null,
      });
      if (rpcErr) throw rpcErr;

      // 5) Notify owner
      await supabase.functions.invoke("notify-survey-submitted", {
        body: {
          token,
          response_id: responseId,
          pdf_url: pdfUrl,
          pdf_storage_path: pdfPath,
          submitter_name: submitterName,
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
                photoGroup={photoGroups[f.key]}
                onPhotoGroup={(g) => setPhotoGroups((prev) => ({ ...prev, [f.key]: g }))}
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
  field, value, onChange, photoGroup, onPhotoGroup, signatureUrl, onSignature,
}: {
  field: SurveyField;
  value: any;
  onChange: (v: any) => void;
  photoGroup: { files: File[]; captions: string[] } | undefined;
  onPhotoGroup: (g: { files: File[]; captions: string[] }) => void;
  signatureUrl: string | null;
  onSignature: (url: string | null) => void;
}) {
  const id = `f-${field.key}`;
  return (
    <div className="space-y-1.5">
      {field.type !== "static" && (
        <Label htmlFor={id}>
          {field.label} {field.required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      {field.helpLink && (
        <a
          href={field.helpLink.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {field.helpLink.label} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {field.type === "static" && field.body && (
        <div className="rounded border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {field.body}
        </div>
      )}
      {field.type === "text" && (
        <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "date" && (
        <Input id={id} type="datetime-local" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "number" && (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          readOnly={field.key === "total_sockets"}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
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
      {field.type === "radio" && (
        <RadioGroup value={value ?? ""} onValueChange={onChange} className="space-y-1">
          {(field.options ?? []).map((o) => (
            <div key={o} className="flex items-center gap-2">
              <RadioGroupItem value={o} id={`${id}-${o}`} />
              <Label htmlFor={`${id}-${o}`} className="font-normal">{o}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
      {field.type === "composite_distance" && (
        <CompositeDistanceInput
          value={value as CompositeDistanceValue | undefined}
          onChange={onChange}
          multi={!!field.multi}
        />
      )}
      {field.type === "photo_group" && (
        <PhotoGroupInput
          value={photoGroup ?? { files: [], captions: [] }}
          onChange={onPhotoGroup}
          max={field.maxPhotos ?? 5}
        />
      )}
      {field.type === "signature" && (
        <SignaturePad value={signatureUrl} onChange={onSignature} />
      )}
    </div>
  );
}

function PhotoGroupInput({
  value,
  onChange,
  max,
}: {
  value: { files: File[]; captions: string[] };
  onChange: (g: { files: File[]; captions: string[] }) => void;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const remove = (i: number) =>
    onChange({
      files: value.files.filter((_, j) => j !== i),
      captions: value.captions.filter((_, j) => j !== i),
    });
  const setCaption = (i: number, c: string) => {
    const captions = [...value.captions];
    captions[i] = c;
    onChange({ files: value.files, captions });
  };
  const remaining = Math.max(0, max - value.files.length);
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
          const list = Array.from(e.target.files ?? []).slice(0, remaining);
          onChange({
            files: [...value.files, ...list],
            captions: [...value.captions, ...list.map(() => "")],
          });
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={remaining === 0}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3 w-3 mr-1" /> Add photos ({value.files.length}/{max})
      </Button>
      {value.files.length > 0 && (
        <div className="space-y-2">
          {value.files.map((f, i) => {
            const url = URL.createObjectURL(f);
            return (
              <div key={i} className="flex gap-2 items-start rounded border p-2">
                <img src={url} alt={f.name} className="h-20 w-20 rounded object-cover flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Caption (optional)"
                    value={value.captions[i] ?? ""}
                    onChange={(e) => setCaption(i, e.target.value)}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground truncate">{f.name}</p>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompositeDistanceInput({
  value,
  onChange,
  multi,
}: {
  value: CompositeDistanceValue | undefined;
  onChange: (v: CompositeDistanceValue) => void;
  multi: boolean;
}) {
  const v: CompositeDistanceValue = value ?? { rows: [{ surface: "", distance: null }], description: "" };
  const setRow = (i: number, patch: Partial<{ surface: string; distance: number | null }>) => {
    const rows = v.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange({ ...v, rows });
  };
  const addRow = () => onChange({ ...v, rows: [...v.rows, { surface: "", distance: null }] });
  const removeRow = (i: number) => onChange({ ...v, rows: v.rows.filter((_, j) => j !== i) });
  const total = sumComposite(v);

  return (
    <div className="space-y-2 rounded border p-2">
      {v.rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
          <Select value={r.surface} onValueChange={(s) => setRow(i, { surface: s })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Surface type" /></SelectTrigger>
            <SelectContent>
              {SURFACE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Distance (m)"
            value={r.distance ?? ""}
            onChange={(e) => setRow(i, { distance: e.target.value === "" ? null : Number(e.target.value) })}
            className="h-9"
          />
          {multi && v.rows.length > 1 && (
            <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          )}
          {(!multi || v.rows.length === 1) && <div />}
        </div>
      ))}
      {multi && (
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" /> Add surface
          </Button>
          {total !== null && (
            <span className="text-xs font-medium">Total: {total} m</span>
          )}
        </div>
      )}
      <Textarea
        placeholder="Description / notes"
        value={v.description ?? ""}
        onChange={(e) => onChange({ ...v, description: e.target.value })}
        rows={2}
        className="text-xs"
      />
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