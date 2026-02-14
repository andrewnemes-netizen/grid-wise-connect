import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, Search, Eye } from "lucide-react";
import { format } from "date-fns";

const scoreBadge: Record<string, string> = {
  GREEN: "bg-emerald-100 text-emerald-800 border-emerald-300",
  AMBER: "bg-amber-100 text-amber-800 border-amber-300",
  RED: "bg-red-100 text-red-800 border-red-300",
};

const Portfolio = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterScore, setFilterScore] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["sites", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const filtered = sites.filter((s: any) => {
    if (filterScore !== "all" && s.score !== filterScore) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search && !s.site_name?.toLowerCase().includes(search.toLowerCase()) && !s.postcode?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-4 h-full overflow-auto">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Portfolio</h2>
        <Badge variant="secondary" className="ml-2">{filtered.length} sites</Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or postcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterScore} onValueChange={setFilterScore}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Score" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scores</SelectItem>
            <SelectItem value="GREEN">Green</SelectItem>
            <SelectItem value="AMBER">Amber</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewing">Reviewing</SelectItem>
            <SelectItem value="viable">Viable</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>kW</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No sites found. Use the map to run a feasibility check and save a site.</TableCell></TableRow>
              ) : (
                filtered.map((site: any) => (
                  <TableRow key={site.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/site/${site.id}`)}>
                    <TableCell className="font-medium">{site.site_name}</TableCell>
                    <TableCell className="text-muted-foreground">{site.postcode || "—"}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{site.site_type || "—"}</TableCell>
                    <TableCell>{site.proposed_kw || "—"}</TableCell>
                    <TableCell>
                      {site.score ? (
                        <Badge variant="outline" className={scoreBadge[site.score] || ""}>{site.score}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{site.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(site.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Portfolio;
