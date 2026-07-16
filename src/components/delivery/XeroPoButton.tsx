import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CloudUpload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  po: {
    id: string;
    xero_purchase_order_id?: string | null;
    xero_status?: string | null;
  };
  onDone?: () => void;
}

export function XeroPoButton({ po, onDone }: Props) {
  const push = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-push-po", {
        body: { po_id: po.id },
      });
      if (error) throw error;
      return data as { xero_status: string };
    },
    onSuccess: (d) => { toast.success(`Pushed to Xero (${d.xero_status})`); onDone?.(); },
    onError: (e: any) => toast.error(e.message ?? "Xero push failed"),
  });

  if (po.xero_purchase_order_id) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] mr-2" title="In Xero">
        Xero {po.xero_status?.toLowerCase() ?? "synced"}
      </Badge>
    );
  }

  return (
    <Button size="sm" variant="outline" className="mr-2" onClick={() => push.mutate()} disabled={push.isPending}>
      {push.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5 mr-1" />}
      Push to Xero
    </Button>
  );
}