import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Map, Download, CheckCircle, AlertTriangle, Ruler, Shield, PoundSterling, FileText, Settings2 } from "lucide-react";
import { generateAssessmentPdf, type PdfSections } from "@/lib/generateAssessmentPdf";
import type { CostEstimate, CostLineItem, BomItem } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";
import { StudyShareDialog } from "@/components/study/StudyShareDialog";
import { StudyCommentsPanel } from "@/components/study/StudyCommentsPanel";
import { StudyActivityFeed } from "@/components/study/StudyActivityFeed";

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  complete: "bg-green-100 text-green-800 border-green-200",
  archived: "bg-muted text-muted-foreground",
};

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: unitRates } = useUnitRates();
  const [pdfSections, setPdfSections] = useState<PdfSections>({
    coverPage: true,
    executiveSummary: true,
    siteDetails: true,
    routeMap: true,
    electricalValidation: true,
    costBreakdown: true,
    bom: true,
    designElements: true,
    keyFindings: true,
    nextSteps: true,
  });

  const toggleSection = (key: keyof PdfSections) => {
    setPdfSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { data: study, isLoading } = useQuery({
    queryKey: ["study", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading study…</div>;
  if (!study) return <div className="p-6 text-muted-foreground">Study not found.</div>;

  const engineOutput = study.engine_output_json as Record<string, any> | null;
  const costEstimate = study.cost_estimate_json as unknown as CostEstimate | null;
  const bomItems = (study.bom_json as unknown as BomItem[] | null) || [];

  const handleExportPdf = () => {
    generateAssessmentPdf({
      siteName: study.study_name,
      proposedKw: study.proposed_kw || 0,
      lat: 0,
      lng: 0,
      score: engineOutput?.warnings?.length > 0 ? "AMBER" : "GREEN",
      reasons: engineOutput?.warnings || [],
      nextSteps: engineOutput?.compliance_flags || [],
      distances: { primary_m: 0, feeder_m: 0, capacity_segment_m: 0 },
      sections: pdfSections,
      unitRates,
    });
  };

  const sectionLabels: { key: keyof PdfSections; label: string }[] = [
    { key: "coverPage", label: "Cover Page" },
    { key: "siteDetails", label: "Site Details" },
    { key: "routeMap", label: "Route Map" },
    { key: "electricalValidation", label: "Electrical Validation" },
    { key: "costBreakdown", label: "Cost Breakdown" },
    { key: "bom", label: "Bill of Materials" },
    { key: "designElements", label: "Design Elements" },
    { key: "keyFindings", label: "Key Findings" },
    { key: "nextSteps", label: "Next Steps" },
  ];

  const groupedBreakdown = costEstimate?.breakdown?.reduce<Record<string, CostLineItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {}) || {};

  const groupedBom = bomItems.reduce<Record<string, BomItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/studies")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{study.study_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={statusColors[study.status] || ""}>{study.status}</Badge>
            <Badge variant="secondary">{study.mode === "connect" ? "Connect" : "Design"}</Badge>
            {study.dno && <Badge variant="outline">{study.dno}</Badge>}
            {study.voltage_level && <Badge variant="outline">{study.voltage_level}</Badge>}
            {study.ruleset_version && <Badge variant="outline">Ruleset {study.ruleset_version}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <StudyShareDialog studyId={study.id} studyName={study.study_name} />
          <Button variant="outline" onClick={() => navigate(`/?study=${study.id}`)}>
            <Map className="h-4 w-4 mr-2" />Open on Map
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Download className="h-4 w-4 mr-2" />Export PDF
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Export PDF Report</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">Select sections to include:</p>
                <div className="grid grid-cols-2 gap-2">
                  {sectionLabels.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={`sec-${key}`}
                        checked={pdfSections[key]}
                        onCheckedChange={() => toggleSection(key)}
                      />
                      <Label htmlFor={`sec-${key}`} className="text-sm cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={handleExportPdf}>
                  <Download className="h-4 w-4 mr-2" />Generate PDF
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Study Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Ruler className="h-4 w-4" />Study Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {study.proposed_kw != null && (
              <div className="flex justify-between"><span className="text-muted-foreground">Proposed Load</span><span className="font-medium">{study.proposed_kw} kW</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><span className="font-medium capitalize">{study.mode}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(study.created_at).toLocaleDateString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span>{new Date(study.updated_at).toLocaleDateString()}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Boundary</span>
              <span>{study.boundary_geojson ? "✓ Drawn" : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Route</span>
              <span>{study.route_geojson ? "✓ Drawn" : "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* DNO Rules Output */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />DNO Rules Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {engineOutput ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">DNO</span><span className="font-medium">{engineOutput.dno_code}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duct Size</span><span className="font-medium">{engineOutput.duct_size_mm}mm</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service Length Cap</span><span>{engineOutput.service_length_cap_m}m</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Joint Spacing</span><span>{engineOutput.joint_spacing_m}m</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Est. Joints</span><span>{engineOutput.estimated_joints}</span></div>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase">Cover Depths (mm)</p>
                {engineOutput.cover_depths_mm && Object.entries(engineOutput.cover_depths_mm).map(([surface, depth]) => (
                  <div key={surface} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{surface}</span>
                    <span>{String(depth)}mm</span>
                  </div>
                ))}
                {engineOutput.warnings?.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Warnings</p>
                    {engineOutput.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {w}
                      </div>
                    ))}
                  </>
                )}
                {engineOutput.compliance_flags?.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Compliance</p>
                    <div className="flex flex-wrap gap-1">
                      {engineOutput.compliance_flags.map((f: string) => (
                        <Badge key={f} variant="outline" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />{f}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No rules applied yet. Draw a route on the map to trigger the rules engine.</p>
            )}
          </CardContent>
        </Card>

        {/* Cost Estimate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PoundSterling className="h-4 w-4" />Cost Estimate
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {costEstimate ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">Estimated Total</p>
                  <p className="text-xl font-bold text-foreground">{formatGBP(costEstimate.total_estimate)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{costEstimate.voltage_level}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{costEstimate.confidence} confidence</Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  {[
                    { label: "Cable", value: costEstimate.cable_cost, color: "bg-blue-500" },
                    { label: "Excavation", value: costEstimate.excavation_cost, color: "bg-amber-500" },
                    { label: "Equipment", value: costEstimate.equipment_cost, color: "bg-purple-500" },
                    ...(costEstimate.reinforcement_cost > 0 ? [{ label: "Reinforcement", value: costEstimate.reinforcement_cost, color: "bg-red-500" }] : []),
                  ].map((bar) => (
                    <div key={bar.label} className="flex items-center gap-2 text-[10px]">
                      <span className="w-20 text-muted-foreground">{bar.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${(bar.value / costEstimate.subtotal) * 100}%` }} />
                      </div>
                      <span className="w-16 text-right font-medium">{formatGBP(bar.value)}</span>
                    </div>
                  ))}
                </div>

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase">Breakdown</p>
                {Object.entries(groupedBreakdown).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{category}</p>
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[10px] py-0.5">
                        <span className="text-foreground">{item.description}</span>
                        <span className="font-medium">{formatGBP(item.total)}</span>
                      </div>
                    ))}
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded border bg-muted/20 px-2 py-1.5">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="float-right font-semibold">{formatGBP(costEstimate.subtotal)}</span>
                  </div>
                  <div className="rounded border bg-muted/20 px-2 py-1.5">
                    <span className="text-muted-foreground">Fees + Contingency</span>
                    <span className="float-right font-semibold">{formatGBP(costEstimate.design_fee + costEstimate.project_management + costEstimate.contingency)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No cost estimate yet. Draw a route on the map with a proposed load set.</p>
            )}
          </CardContent>
        </Card>

        {/* BOM */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />Bill of Materials
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {bomItems.length > 0 ? (
              <div className="space-y-3">
                {Object.entries(groupedBom).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{category}</p>
                    <div className="space-y-0.5">
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between text-[10px] py-0.5">
                          <span className="text-foreground truncate max-w-[50%]">{item.item}</span>
                          <span className="text-muted-foreground">{item.quantity} {item.unit}</span>
                          <span className="font-medium w-14 text-right">{formatGBP(item.total_cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-semibold border-t pt-1">
                  <span>BoM Total</span>
                  <span>{formatGBP(bomItems.reduce((s, b) => s + b.total_cost, 0))}</span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No BOM generated yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardContent className="pt-6">
          <StudyActivityFeed studyId={study.id} />
        </CardContent>
      </Card>

      {/* Comments section */}
      <Card>
        <CardContent className="pt-6">
          <StudyCommentsPanel studyId={study.id} />
        </CardContent>
      </Card>
    </div>
  );
}
