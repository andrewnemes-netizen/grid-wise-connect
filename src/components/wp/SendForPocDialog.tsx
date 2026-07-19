import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";

export interface PocAssignment {
  mode: "internal" | "external";
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  message?: string;
  dueDate: string; // ISO date
  sendEmail: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteCount: number;
  workPackageName?: string;
  onConfirm: (a: PocAssignment) => Promise<void> | void;
  submitting?: boolean;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function SendForPocDialog({ open, onOpenChange, siteCount, workPackageName, onConfirm, submitting }: Props) {
  const defaultDue = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 45);
    return d.toISOString().slice(0, 10);
  }, []);
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [internalUserId, setInternalUserId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("__manual");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState(defaultDue);

  useEffect(() => {
    if (open) {
      setMode("internal");
      setInternalUserId("");
      setContactId("__manual");
      setExternalName("");
      setExternalEmail("");
      setMessage("");
      setDueDate(defaultDue);
    }
  }, [open, defaultDue]);

  const { data: internalUsers = [] } = useQuery({
    queryKey: ["poc-internal-users"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, company")
        .eq("is_approved", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.user_id);
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["poc-external-contacts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, email, role")
        .not("email", "is", null)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (contactId && contactId !== "__manual") {
      const c = (contacts as any[]).find((x) => x.id === contactId);
      if (c) {
        setExternalName(c.full_name ?? "");
        setExternalEmail(c.email ?? "");
      }
    }
  }, [contactId, contacts]);

  const canSubmit = (() => {
    if (mode === "internal") return !!internalUserId;
    return isEmail(externalEmail);
  })();

  const handleConfirm = async () => {
    if (!canSubmit) return;
    if (mode === "internal") {
      const u = (internalUsers as any[]).find((x) => x.user_id === internalUserId);
      await onConfirm({
        mode: "internal",
        assigneeUserId: internalUserId,
        assigneeName: u?.full_name ?? null,
        assigneeEmail: null,
        message: message.trim() || undefined,
        dueDate,
        sendEmail: false,
      });
    } else {
      await onConfirm({
        mode: "external",
        assigneeUserId: null,
        assigneeName: externalName.trim() || null,
        assigneeEmail: externalEmail.trim(),
        message: message.trim() || undefined,
        dueDate,
        sendEmail: true,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" /> Send for POC
          </DialogTitle>
          <DialogDescription>
            Assign the POC application task for{" "}
            <Badge variant="secondary" className="text-[10px]">{siteCount} site{siteCount === 1 ? "" : "s"}</Badge>
            {workPackageName && <> in <span className="font-medium">{workPackageName}</span></>}.
            Internal assignments create an in-app task. External assignments also email the designer.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="internal">Internal designer</TabsTrigger>
            <TabsTrigger value="external">External designer</TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Assign to team member</Label>
              <Select value={internalUserId} onValueChange={setInternalUserId}>
                <SelectTrigger><SelectValue placeholder="Select a team member" /></SelectTrigger>
                <SelectContent>
                  {(internalUsers as any[]).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name}{u.company ? ` · ${u.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">They will be notified in-app via their assigned task.</p>
            </div>
          </TabsContent>

          <TabsContent value="external" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Pick from directory</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Directory contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual">— Enter manually —</SelectItem>
                  {(contacts as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} · {c.email}{c.role ? ` (${c.role})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Designer name" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={externalEmail}
                  onChange={(e) => setExternalEmail(e.target.value)}
                  placeholder="designer@company.com"
                />
              </div>
            </div>
            {externalEmail && !isEmail(externalEmail) && (
              <p className="text-[11px] text-destructive">Enter a valid email address.</p>
            )}
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label>Target return date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Message (optional)</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Any brief for the designer…"
            rows={3}
            maxLength={1000}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || submitting}>
            {submitting ? "Sending…" : mode === "external" ? "Assign & email" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}