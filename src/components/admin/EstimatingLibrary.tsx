import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Library, Plus, ChevronRight, Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { GenericRateCardImport } from "./GenericRateCardImport";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "default" : status === "DRAFT" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{status}</Badge>;
}

/**
 * Single home for Estimating & Quotes admin. Replaces the old three-tab
 * split (Estimating Import / Rate Library / Recipe Library) with one
 * library view: every rate card, its latest version, and a way in to
 * import a new one. Clicking a rate card opens its full detail/edit page.
 */
export function EstimatingLibrary() {
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const qc = useQueryClient();

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["rate-card-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_cards" as any)
        .select(`
          id, name, code, archived_at, contract:contracts(id, name),
          versions:rate_card_versions(id, version_number, status, imported_at, approved_at)
        `)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // For each rate card, pick the version to show: prefer the latest
  // APPROVED, otherwise the latest DRAFT.
  const rows = useMemo(() => {
    return (cards as any[]).map((c) => {
      const versions = [...(c.versions ?? [])].sort((a, b) => b.version_number - a.version_number);
      const approved = versions.find((v) => v.status === "APPROVED");
      const latest = approved ?? versions[0];
      return { card: c, latest, versionCount: versions.length };
    });
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = rows.filter((r) => (showArchived ? !!r.card.archived_at : !r.card.archived_at));
    if (!q) return visible;
    return visible.filter((r) =>
      `${r.card.name} ${r.card.contract?.name ?? ""}`.toLowerCase().includes(q)
    );
  }, [rows, search, showArchived]);

  async function setArchived(cardId: string, archive: boolean) {
    const { error } = await supabase
      .from("rate_cards" as any)
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq("id", cardId);
    if (error) { toast.error(error.message); return; }
    toast.success(archive ? "Rate card archived" : "Rate card restored");
    qc.invalidateQueries({ queryKey: ["rate-card-library"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Library className="h-5 w-5" /> Rate Card Library</CardTitle>
            <CardDescription>
              Every rate card used for quoting — ICP, CK Synthetic, CK MSA, and any others. Click a rate
              card to view or edit it in full. Archived cards are hidden from new quotes.
            </CardDescription>
          </div>
          <Button onClick={() => setShowImport((s) => !s)}>
            <Plus className="h-4 w-4 mr-1.5" /> {showImport ? "Hide import" : "Add rate card"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Input placeholder="Search rate card or client…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
                Show archived
              </Label>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate card</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Latest version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {showArchived ? "No archived rate cards." : "No rate cards yet — add one above."}
                  </TableCell></TableRow>
                ) : filtered.map(({ card, latest, versionCount }) => (
                  <TableRow key={card.id} className={latest ? "cursor-pointer hover:bg-muted/40" : ""}
                    onClick={() => { /* handled by Link below to keep row + link both accessible */ }}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {latest ? (
                          <Link to={`/admin/rate-cards/${latest.id}`} className="hover:underline">{card.name}</Link>
                        ) : card.name}
                        {card.archived_at && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{card.contract?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {latest ? `v${latest.version_number}${versionCount > 1 ? ` (${versionCount} versions)` : ""}` : "No versions"}
                    </TableCell>
                    <TableCell>{latest ? <StatusBadge status={latest.status} /> : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {latest?.imported_at ? format(new Date(latest.imported_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {card.archived_at ? (
                              <DropdownMenuItem onClick={() => setArchived(card.id, false)}>
                                <ArchiveRestore className="h-4 w-4 mr-2" /> Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setArchived(card.id, true)}>
                                <Archive className="h-4 w-4 mr-2" /> Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {latest && (
                          <Link to={`/admin/rate-cards/${latest.id}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showImport && <GenericRateCardImport />}
    </div>
  );
}
