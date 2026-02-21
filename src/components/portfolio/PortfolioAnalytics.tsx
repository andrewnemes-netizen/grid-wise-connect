import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LineChart, Line, CartesianGrid, ResponsiveContainer } from "recharts";
import { TrendingUp, Target, ShieldCheck, Activity } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";

interface Site {
  id: string;
  score: string | null;
  viability_index: number | null;
  reinforcement_probability: number | null;
  cost_band: string | null;
  grid_readiness: string | null;
  created_at: string;
}

interface Props {
  sites: Site[];
}

const SCORE_COLORS: Record<string, string> = {
  GREEN: "hsl(142, 71%, 45%)",
  AMBER: "hsl(38, 92%, 50%)",
  RED: "hsl(0, 72%, 51%)",
};

const GRID_COLORS: Record<string, string> = {
  Strong: "hsl(142, 71%, 45%)",
  Moderate: "hsl(38, 92%, 50%)",
  Constrained: "hsl(0, 72%, 51%)",
};

const scoreConfig = {
  GREEN: { label: "Green", color: SCORE_COLORS.GREEN },
  AMBER: { label: "Amber", color: SCORE_COLORS.AMBER },
  RED: { label: "Red", color: SCORE_COLORS.RED },
};

const costConfig = {
  "£": { label: "£", color: "hsl(142, 71%, 45%)" },
  "££": { label: "££", color: "hsl(38, 92%, 50%)" },
  "£££": { label: "£££", color: "hsl(0, 72%, 51%)" },
};

const gridConfig = {
  Strong: { label: "Strong", color: GRID_COLORS.Strong },
  Moderate: { label: "Moderate", color: GRID_COLORS.Moderate },
  Constrained: { label: "Constrained", color: GRID_COLORS.Constrained },
};

const pipelineConfig = {
  count: { label: "Sites", color: "hsl(var(--primary))" },
};

export function PortfolioAnalytics({ sites }: Props) {
  const stats = useMemo(() => {
    const total = sites.length;
    const withViability = sites.filter(s => s.viability_index != null);
    const avgViability = withViability.length
      ? Math.round(withViability.reduce((sum, s) => sum + (s.viability_index ?? 0), 0) / withViability.length)
      : 0;
    const greenCount = sites.filter(s => s.score === "GREEN").length;
    const scored = sites.filter(s => s.score).length;
    const passRate = scored > 0 ? Math.round((greenCount / scored) * 100) : 0;
    const withReinf = sites.filter(s => s.reinforcement_probability != null);
    const avgReinf = withReinf.length
      ? Math.round(withReinf.reduce((sum, s) => sum + (s.reinforcement_probability ?? 0), 0) / withReinf.length)
      : 0;
    return { total, avgViability, passRate, avgReinf };
  }, [sites]);

  const scoreData = useMemo(() => {
    const counts: Record<string, number> = { GREEN: 0, AMBER: 0, RED: 0 };
    sites.forEach(s => { if (s.score && counts[s.score] !== undefined) counts[s.score]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [sites]);

  const costData = useMemo(() => {
    const counts: Record<string, number> = { "£": 0, "££": 0, "£££": 0 };
    sites.forEach(s => { if (s.cost_band && counts[s.cost_band] !== undefined) counts[s.cost_band]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [sites]);

  const gridData = useMemo(() => {
    const counts: Record<string, number> = { Strong: 0, Moderate: 0, Constrained: 0 };
    sites.forEach(s => { if (s.grid_readiness && counts[s.grid_readiness] !== undefined) counts[s.grid_readiness]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [sites]);

  const pipelineData = useMemo(() => {
    const now = new Date();
    const months: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      months.push({ month: format(d, "MMM yy"), count: 0 });
    }
    sites.forEach(s => {
      const label = format(new Date(s.created_at), "MMM yy");
      const entry = months.find(m => m.month === label);
      if (entry) entry.count++;
    });
    return months;
  }, [sites]);

  if (sites.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Target className="h-3.5 w-3.5" />Total Sites
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />Avg Viability
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.avgViability}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ShieldCheck className="h-3.5 w-3.5" />Pass Rate
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.passRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Activity className="h-3.5 w-3.5" />Avg Reinforcement
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.avgReinf}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Score Distribution */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {scoreData.length > 0 ? (
              <ChartContainer config={scoreConfig} className="h-[140px] w-full aspect-auto">
                <PieChart>
                  <Pie data={scoreData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30} strokeWidth={2}>
                    {scoreData.map(entry => (
                      <Cell key={entry.name} fill={SCORE_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No scored sites</p>
            )}
          </CardContent>
        </Card>

        {/* Cost Band */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground">Cost Band</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {costData.length > 0 ? (
              <ChartContainer config={costConfig} className="h-[140px] w-full aspect-auto">
                <BarChart data={costData}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis hide />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {costData.map(entry => (
                      <Cell key={entry.name} fill={costConfig[entry.name as keyof typeof costConfig]?.color || "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No cost data</p>
            )}
          </CardContent>
        </Card>

        {/* Grid Readiness */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground">Grid Readiness</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {gridData.length > 0 ? (
              <ChartContainer config={gridConfig} className="h-[140px] w-full aspect-auto">
                <BarChart data={gridData}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis hide />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {gridData.map(entry => (
                      <Cell key={entry.name} fill={GRID_COLORS[entry.name] || "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No grid data</p>
            )}
          </CardContent>
        </Card>

        {/* Monthly Pipeline */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground">Monthly Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ChartContainer config={pipelineConfig} className="h-[140px] w-full aspect-auto">
              <LineChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={8} interval={2} />
                <YAxis hide />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
