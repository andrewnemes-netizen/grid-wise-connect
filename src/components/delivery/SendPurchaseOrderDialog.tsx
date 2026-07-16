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
import { Loader2, Mail, Download } from "lucide-react";
import { toast } from "sonner";
import { generatePoPdf, downloadPoPdf } from "@/lib/po-pdf";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  po: any;
  workPackage?: any;
}

export function SendPurchaseOrderDialog({ open, onOpenChange, po, workPackage }: Props) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientCompany, setRecipientCompany] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState(
    `Purchase order ${po.po_number ?? ""} — EcoPower UK`,
  );
  const [message, setMessage] = useState(
    `Please find attached purchase order ${po.po_number ?? ""}${workPackage?.wp_code ? ` for ${workPackage.wp_code}` : ""}.`,
  );

  const { data: lines = [] } = useQuery({
    queryKey: ["po-lines-for-send", po.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("po_lines")
        .select("description, line_value, sort_index")
        .eq("po_id", po.id)
        .order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const blob = generatePoPdf({
        po,
        lines,
        workPackage,
        recipientName,
        recipientCompany,
        recipientEmail,
      });
      const safeNum = String(po.po_number ?? "purchase-order").replace(/[^a-z0-9-_]/gi, "_");
      const path = `${po.org_id}/${po.id}/${Date.now()}-${safeNum}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("purchase-orders")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("send-purchase-order", {
        body: {
          po_id: po.id,
          storage_path: path,
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim() || undefined,
          recipient_company: recipientCompany.trim() || undefined,
          subject: subject.trim(),
          message: message.trim() || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Purchase order sent");
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
            <Mail className="h-4 w-4 text-primary" /> Send purchase order
          </DialogTitle>
          <DialogDescription>
            Generates a branded PDF and emails it as an attachment to your supplier or partner from your connected Outlook mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-rcomp">Supplier / partner company</Label>
            <Input id="po-rcomp" value={recipientCompany} onChange={(e) => setRecipientCompany(e.target.value)} placeholder="Acme Civils Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-rname">Contact name</Label>
              <Input id="po-rname" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Alex Smith" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-remail">Contact email</Label>
              <Input id="po-remail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="alex@acme.co.uk" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-subj">Subject</Label>
            <Input id="po-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-msg">Message</Label>
            <Textarea id="po-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadPoPdf({ po, lines, workPackage, recipientName, recipientCompany, recipientEmail })}
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