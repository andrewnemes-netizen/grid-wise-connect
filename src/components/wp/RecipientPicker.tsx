import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, UserPlus, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type ExternalContact = { id: string; full_name: string; email?: string | null; role?: string | null };

type Props = {
  wpId: string;
  /** Selected internal user IDs (multi always; single stages use [0]). */
  userIds: string[];
  contactIds: string[];
  onChange: (next: { userIds: string[]; contactIds: string[] }) => void;
  multi?: boolean;
  /** Suggested default role — first WP team member with this role is used as pre-select. */
  suggestedRole?: string | null;
  label?: string;
  requiredHint?: string | null;
};

/**
 * Searchable recipient picker: internal WP team + org members, with an
 * external-contact popover. Single or multi. Never auto-writes — parent
 * decides when to persist. Suggested pre-select is a visible hint only.
 */
export function RecipientPicker({
  wpId, userIds, contactIds, onChange, multi = false, suggestedRole, label = "Notify who?", requiredHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["recipient-picker-members", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data: raw } = await (supabase as any)
        .from("wp_team")
        .select("user_id, team_role")
        .eq("work_package_id", wpId);
      const ids = (raw ?? []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data: profs } = await (supabase as any)
        .from("profiles").select("id, full_name, email").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (raw ?? []).map((r: any) => ({
        user_id: r.user_id,
        team_role: r.team_role,
        profile: map.get(r.user_id),
      }));
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["recipient-picker-contacts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("contacts").select("id, full_name, email, role").order("full_name").limit(500);
      return (data ?? []) as ExternalContact[];
    },
  });

  const memberById = useMemo(() => new Map((members as any[]).map((m) => [m.user_id, m])), [members]);
  const contactById = useMemo(() => new Map((contacts as ExternalContact[]).map((c) => [c.id, c])), [contacts]);

  const toggleUser = (id: string) => {
    if (multi) {
      onChange({
        userIds: userIds.includes(id) ? userIds.filter((x) => x !== id) : [...userIds, id],
        contactIds,
      });
    } else {
      onChange({ userIds: [id], contactIds: [] });
      setOpen(false);
    }
  };
  const toggleContact = (id: string) => {
    if (multi) {
      onChange({
        userIds,
        contactIds: contactIds.includes(id) ? contactIds.filter((x) => x !== id) : [...contactIds, id],
      });
    } else {
      onChange({ userIds: [], contactIds: [id] });
      setContactOpen(false);
    }
  };
  const clearAll = () => onChange({ userIds: [], contactIds: [] });

  const hasAny = userIds.length + contactIds.length > 0;
  const suggestedMember = suggestedRole
    ? (members as any[]).find((m) => (m.team_role ?? "").toLowerCase().includes(suggestedRole.toLowerCase()))
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {label}{multi && <span className="ml-1 text-[10px] uppercase tracking-wide">(multiple)</span>}
        </span>
        {hasAny && (
          <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={clearAll}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Selected chips */}
      {hasAny && (
        <div className="flex flex-wrap gap-1">
          {userIds.map((id) => {
            const m = memberById.get(id);
            const name = m?.profile?.full_name || m?.profile?.email || id.slice(0, 8);
            return (
              <Badge key={id} variant="secondary" className="gap-1">
                {name}
                <button onClick={() => toggleUser(id)} className="opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
              </Badge>
            );
          })}
          {contactIds.map((id) => {
            const c = contactById.get(id);
            const name = c?.full_name || id.slice(0, 8);
            return (
              <Badge key={id} variant="outline" className="gap-1">
                {name} <span className="text-[9px] uppercase">ext</span>
                <button onClick={() => toggleContact(id)} className="opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Suggestion */}
      {!hasAny && suggestedMember && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Suggested: {suggestedMember.profile?.full_name || suggestedMember.profile?.email}</span>
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]"
            onClick={() => toggleUser(suggestedMember.user_id)}>
            Use suggested
          </Button>
          <span className="text-[10px]">Confirm or change before saving.</span>
        </div>
      )}

      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="justify-between flex-1 h-9">
              <span className="text-xs text-muted-foreground">
                {hasAny ? (multi ? "Add another internal user" : "Change internal user") : "Pick internal user"}
              </span>
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="start">
            <Command>
              <CommandInput placeholder="Search by name or email…" />
              <CommandList>
                <CommandEmpty>No team members. Add people under Team.</CommandEmpty>
                <CommandGroup heading="WP team">
                  {(members as any[]).map((m) => {
                    const name = m.profile?.full_name || m.profile?.email || m.user_id;
                    const selected = userIds.includes(m.user_id);
                    return (
                      <CommandItem key={m.user_id} value={`${name} ${m.team_role ?? ""}`} onSelect={() => toggleUser(m.user_id)}>
                        <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1">{name}</span>
                        {m.team_role && <Badge variant="outline" className="text-[10px]">{m.team_role}</Badge>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Popover open={contactOpen} onOpenChange={setContactOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9">
              <UserPlus className="h-3.5 w-3.5 mr-1" /> External
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="end">
            <Command>
              <CommandInput placeholder="Search external contacts…" />
              <CommandList>
                <CommandEmpty>No external contacts recorded.</CommandEmpty>
                <CommandGroup heading="External contacts">
                  {(contacts as ExternalContact[]).map((c) => {
                    const selected = contactIds.includes(c.id);
                    return (
                      <CommandItem key={c.id} value={`${c.full_name} ${c.email ?? ""} ${c.role ?? ""}`} onSelect={() => toggleContact(c.id)}>
                        <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1">{c.full_name}</span>
                        {c.role && <Badge variant="outline" className="text-[10px]">{c.role}</Badge>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandGroup heading="New">
                  <CommandItem disabled className="text-[11px] text-muted-foreground">
                    Add new external contacts in Delivery → Contacts, then reload.
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {requiredHint && !hasAny && (
        <p className="text-[11px] text-destructive">{requiredHint}</p>
      )}
    </div>
  );
}