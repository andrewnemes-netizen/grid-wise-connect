import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldQuestion, Clock, CheckCircle2, XCircle } from "lucide-react";

const REQUESTABLE_ROLES = [
  { value: "engineer", label: "Engineer", description: "Access engineering tools, network data, and full study features" },
  { value: "client", label: "Client", description: "View sites and high-level viability data for your organisation" },
  { value: "admin", label: "Admin", description: "Full platform access including user management and data uploads" },
] as const;

export function RoleRequestDialog() {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");

  const { data: myRequests = [] } = useQuery({
    queryKey: ["my-role-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("role_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const submitRequest = useMutation({
    mutationFn: async (role: string) => {
      const { error } = await supabase.from("role_requests").insert({
        user_id: user!.id,
        requested_role: role as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-role-requests"] });
      setSelectedRole("");
      toast({ title: "Role requested", description: "An admin will review your request." });
    },
    onError: (e: any) => {
      if (e.message?.includes("duplicate")) {
        toast({ title: "Already requested", description: "You already have a pending request for this role.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const pendingRequests = myRequests.filter((r: any) => r.status === "pending");
  const availableRoles = REQUESTABLE_ROLES.filter(
    (r) => !roles.includes(r.value as any) && !pendingRequests.some((pr: any) => pr.requested_role === r.value)
  );

  const statusIcon = (status: string) => {
    if (status === "pending") return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    if (status === "approved") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground">
          <ShieldQuestion className="h-3.5 w-3.5 mr-2" />
          Request Access
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Role Access</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current roles */}
          {roles.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Your current roles:</p>
              <div className="flex gap-1">
                {roles.map((r) => (
                  <Badge key={r} variant="secondary" className="capitalize text-xs">{r}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Request new role */}
          {availableRoles.length > 0 ? (
            <div>
              <p className="text-sm font-medium mb-2">Request a new role:</p>
              <RadioGroup value={selectedRole} onValueChange={setSelectedRole} className="space-y-2">
                {availableRoles.map((r) => (
                  <div key={r.value} className="flex items-start space-x-3 rounded-md border p-3">
                    <RadioGroupItem value={r.value} id={r.value} className="mt-0.5" />
                    <div>
                      <Label htmlFor={r.value} className="font-medium capitalize cursor-pointer">{r.label}</Label>
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
              <Button
                className="w-full mt-3"
                disabled={!selectedRole || submitRequest.isPending}
                onClick={() => submitRequest.mutate(selectedRole)}
              >
                Submit Request
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {roles.length === REQUESTABLE_ROLES.length
                ? "You already have all available roles."
                : "You have pending requests for all remaining roles."}
            </p>
          )}

          {/* Request history */}
          {myRequests.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Your requests:</p>
              <div className="space-y-1">
                {myRequests.map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-1.5">
                      {statusIcon(req.status)}
                      <span className="capitalize font-medium">{req.requested_role}</span>
                    </div>
                    <Badge variant={req.status === "pending" ? "outline" : req.status === "approved" ? "secondary" : "destructive"} className="text-[10px] capitalize">
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
