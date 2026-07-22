import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bot, HardHat, Briefcase, Truck, Shield } from "lucide-react";

export type AgentId = "general" | "precon" | "sales" | "delivery" | "admin";

export const AGENTS: { id: AgentId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "general", label: "General", icon: <Bot className="h-4 w-4" />, description: "Search sites, programmes and studies" },
  { id: "precon", label: "Pre-Con", icon: <HardHat className="h-4 w-4" />, description: "Stage status, owners and progress" },
  { id: "sales", label: "Sales", icon: <Briefcase className="h-4 w-4" />, description: "Leads, contacts, accounts and deals" },
  { id: "delivery", label: "Delivery", icon: <Truck className="h-4 w-4" />, description: "Work packages, tasks and site status" },
  { id: "admin", label: "Admin", icon: <Shield className="h-4 w-4" />, description: "Org, user and settings management" },
];

export function AgentSelector({
  threadId,
  agentId,
  onChange,
  autoExecuteSafe,
  onAutoExecuteChange,
}: {
  threadId: string;
  agentId: AgentId;
  onChange: (id: AgentId) => void;
  autoExecuteSafe: boolean;
  onAutoExecuteChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function persist(next: AgentId) {
    setLoading(true);
    const { error } = await supabase
      .from("assistant_threads")
      .update({ agent_id: next })
      .eq("id", threadId);
    setLoading(false);
    if (error) {
      console.error("Failed to switch agent", error);
      return;
    }
    onChange(next);
  }

  async function persistAuto(v: boolean) {
    const { error } = await supabase
      .from("assistant_threads")
      .update({ auto_execute_safe: v })
      .eq("id", threadId);
    if (error) {
      console.error("Failed to update auto-execute", error);
      return;
    }
    onAutoExecuteChange(v);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/60 bg-background/85 backdrop-blur">
      <Select value={agentId} onValueChange={(v) => persist(v as AgentId)} disabled={loading}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="Select agent" />
        </SelectTrigger>
        <SelectContent>
          {AGENTS.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              <div className="flex items-center gap-2">
                {a.icon}
                <span>{a.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 ml-auto">
        <Switch
          id={`auto-exec-${threadId}`}
          checked={autoExecuteSafe}
          onCheckedChange={persistAuto}
          className="scale-75"
        />
        <Label htmlFor={`auto-exec-${threadId}`} className="text-[11px] text-muted-foreground cursor-pointer">
          Auto-run safe actions
        </Label>
      </div>
    </div>
  );
}
