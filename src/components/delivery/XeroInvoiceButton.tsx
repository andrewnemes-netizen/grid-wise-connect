import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CloudUpload, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  invoice: {
    id: string;
    xero_invoice_id?: string | null;
    xero_status?: string | null;
    xero_amount_paid?: number | null;
    xero_amount_due?: number | null;
  };
  onDone?: () => void;
}

export function XeroInvoiceButton({ invoice, onDone }: Props) {
  const push = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-push-invoice", {
        body: { invoice_id: invoice.id },
      });
      if (error) throw error;
      return data as { xero_status: string };
    },
    onSuccess: (d) => {
      toast.success(`Pushed to Xero (${d.xero_status})`);
      onDone?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Xero push failed"),
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-sync-payments", { method: "POST" });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Refreshed from Xero"); onDone?.(); },
    onError: (e: any) => toast.error(e.message ?? "Refresh failed"),
  });

  if (!invoice.xero_invoice_id) {
    return (
      <Button size="sm" variant="ghost" className="h-7" title="Push to Xero" onClick={() => push.mutate()} disabled={push.isPending}>
        {push.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
      </Button>
    );
  }

  const status = invoice.xero_status ?? "SYNCED";
  const paid = Number(invoice.xero_amount_paid ?? 0);
  const due = invoice.xero_amount_due != null ? Number(invoice.xero_amount_due) : null;
  const tone = status === "PAID"
    ? "bg-emerald-500/15 text-emerald-700"
    : status === "AUTHORISED"
    ? "bg-blue-500/15 text-blue-700"
    : "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-1">
      <Badge className={`${tone} text-[10px]`} title={`Xero: ${status}`}>
        Xero {status === "PAID" ? "paid" : due != null ? `£${due.toFixed(2)} due` : status.toLowerCase()}
        {paid > 0 && status !== "PAID" && ` · £${paid.toFixed(2)} paid`}
      </Badge>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Refresh Xero status" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
        {refresh.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}