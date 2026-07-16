import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Loader2, Mail, Download } from "lucide-react";
import { toast } from "sonner";
import { generateInvoicePdf, downloadInvoicePdf } from "@/lib/invoice-pdf";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: any;
  project?: any;
}

export function SendInvoiceDialog({ open, onOpenChange, invoice, project }: Props) {
  const isPA = invoice.doc_type === "payment_application";
  const label = isPA ? "Payment application" : "Invoice";
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState(
    `${label} ${invoice.invoice_number} — EcoPower UK`,
  );
  const [message, setMessage] = useState(
    `Please find attached ${label.toLowerCase()} ${invoice.invoice_number}${project?.project_code ? ` for ${project.project_code}` : ""}.`,
  );

  const send = useMutation({
    mutationFn: async () => {
      const blob = generateInvoicePdf({
        invoice,
        project,
        clientName: recipientName,
        clientEmail: recipientEmail,
      });
      const safeNum = String(invoice.invoice_number ?? "invoice").replace(/[^a-z0-9-_]/gi, "_");
      const path = `${invoice.org_id}/${invoice.id}/${Date.now()}-${safeNum}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("send-invoice", {
        body: {
          invoice_id: invoice.id,
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
      toast.success(`${label} sent`);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send"),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Send {label.toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Generates a branded PDF and emails it as an attachment from your connected Outlook mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="in-rname">Recipient name</Label>
              <Input id="in-rname" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Accounts payable" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-remail">Recipient email</Label>
              <Input id="in-remail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="ap@client.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-subj">Subject</Label>
            <Input id="in-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-msg">Message</Label>
            <Textarea id="in-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadInvoicePdf({ invoice, project, clientName: recipientName, clientEmail: recipientEmail })}
          >
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button type="button" onClick={() => send.mutate()} disabled={!emailValid || send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}