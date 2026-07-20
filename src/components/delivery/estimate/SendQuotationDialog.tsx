import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateQuotationPdf, downloadQuotationPdf } from "@/lib/quotation-pdf";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  estimate: any;
  groups: any[];
  lines: any[];
  siteName?: string;
  /** When true, the estimate.id refers to public.site_estimates(id) instead of public.estimates(id). */
  isSiteEstimate?: boolean;
}

export function SendQuotationDialog({ open, onOpenChange, estimate, groups, lines, siteName, isSiteEstimate }: Props) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState(
    `Quotation ${estimate.ref ?? estimate.name ?? ""} — EcoPower UK`.trim(),
  );
  const [message, setMessage] = useState(
    `Please find attached our quotation for ${siteName ?? estimate.name ?? "your project"}. Let me know if you have any questions.`,
  );

  const history = useQuery({
    queryKey: ["quotation-sends", isSiteEstimate ? "site" : "wp", estimate.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_sends" as any)
        .select("*")
        .eq(isSiteEstimate ? "site_estimate_id" : "estimate_id", estimate.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  const send = useMutation({
    mutationFn: async () => {
      // 1) Generate PDF
      const blob = generateQuotationPdf({
        estimate,
        groups,
        lines,
        siteName,
        clientName: recipientName,
        clientEmail: recipientEmail,
      });

      // 2) Upload to storage
      const path = `${estimate.id}/${Date.now()}-${(estimate.ref ?? "quotation").replace(/[^a-z0-9-_]/gi, "_")}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("quotations")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      // 3) Invoke edge function
      const { data, error } = await supabase.functions.invoke("send-quotation", {
        body: {
          ...(isSiteEstimate
            ? { site_estimate_id: estimate.id }
            : { estimate_id: estimate.id }),
          storage_path: path,
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim() || undefined,
          subject: subject.trim(),
          message: message.trim() || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Quotation sent");
      history.refetch();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send quotation"),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Send quotation to client
          </DialogTitle>
          <DialogDescription>
            Generates a branded PDF from this estimate and emails it as an attachment from your connected Outlook mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rname">Client name</Label>
              <Input id="rname" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remail">Client email</Label>
              <Input id="remail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="jane@client.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subj">Subject</Label>
            <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg">Message</Label>
            <Textarea id="msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          {(history.data?.length ?? 0) > 0 && (
            <div className="border rounded-md p-2 bg-muted/30 text-xs space-y-1 max-h-32 overflow-auto">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Recent sends</div>
              {history.data?.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{s.recipient_email}</span>
                  <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString("en-GB")}</span>
                  <span className={s.status === "sent" ? "text-primary" : s.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadQuotationPdf({ estimate, groups, lines, siteName, clientName: recipientName, clientEmail: recipientEmail })}
          >
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button
            type="button"
            onClick={() => send.mutate()}
            disabled={!emailValid || send.isPending}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
            Send to client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}