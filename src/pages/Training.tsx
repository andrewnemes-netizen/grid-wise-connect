import { useState, useRef, useEffect } from "react";
import { BookOpen, Download, ChevronRight, Map, MapPin, Cable, Pentagon, Ruler, SquareDashedBottom, Compass, Trash2, FolderOpen, Settings, Building2, Zap, Layers, Eye, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { trainingSections, type Section } from "@/data/trainingSections";
import jsPDF from "jspdf";

/* ------------------------------------------------------------------ */
/*  PDF Export                                                         */
/* ------------------------------------------------------------------ */

function generateTrainingPdf(sectionImages: Record<string, string>) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  const addPage = () => { doc.addPage(); y = 20; };
  const checkSpace = (needed: number) => { if (y + needed > 270) addPage(); };

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Gridwise Connect — Training Guide", margin, y);
  y += 12;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Eco Power Energy | Comprehensive user reference", margin, y);
  y += 15;

  trainingSections.forEach((section) => {
    checkSpace(30);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`${section.number}. ${section.title}`, margin, y);
    y += 10;

    // Add image if available
    const imgUrl = sectionImages[section.id];
    if (imgUrl) {
      const imgHeight = maxWidth * (9 / 16); // preserve 16:9 aspect ratio
      checkSpace(imgHeight + 5);
      try {
        doc.addImage(imgUrl, "PNG", margin, y, maxWidth, imgHeight);
        y += imgHeight + 5;
      } catch { /* skip if image fails */ }
    }

    section.content.forEach((sub) => {
      checkSpace(20);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(sub.heading, margin, y);
      y += 6;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(sub.body, maxWidth);
      lines.forEach((line: string) => {
        checkSpace(6);
        doc.text(line, margin, y);
        y += 5;
      });
      y += 4;

      if (sub.tips && sub.tips.length > 0) {
        checkSpace(10);
        doc.setFont("helvetica", "italic");
        sub.tips.forEach((tip) => {
          const tipLines = doc.splitTextToSize(`💡 ${tip}`, maxWidth - 5);
          tipLines.forEach((line: string) => {
            checkSpace(6);
            doc.text(line, margin + 5, y);
            y += 5;
          });
        });
        doc.setFont("helvetica", "normal");
        y += 3;
      }
    });

    y += 5;
  });

  doc.save("Gridwise_Connect_Training_Guide.pdf");
}

/* ------------------------------------------------------------------ */
/*  Section Image Component                                            */
/* ------------------------------------------------------------------ */

function SectionImage({ sectionId, imageUrl }: { sectionId: string; imageUrl?: string }) {
  if (!imageUrl) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-8 flex flex-col items-center justify-center gap-2 mb-4">
        <ImagePlus className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground/60">No visual guide generated yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border mb-4 shadow-sm">
      <img
        src={imageUrl}
        alt={`Visual guide for ${sectionId}`}
        className="w-full h-auto"
        loading="lazy"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Training() {
  const [activeSection, setActiveSection] = useState(trainingSections[0].id);
  const [sectionImages, setSectionImages] = useState<Record<string, string>>({});
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  // Load existing images from storage on mount
  useEffect(() => {
    const loadImages = async () => {
      const { data: files } = await supabase.storage.from("training-images").list();
      if (files && files.length > 0) {
        const images: Record<string, string> = {};
        for (const file of files) {
          const sectionId = file.name.replace(".png", "");
          const { data } = supabase.storage.from("training-images").getPublicUrl(file.name);
          images[sectionId] = `${data.publicUrl}?t=${file.updated_at}`;
        }
        setSectionImages(images);
      }
    };
    loadImages();
  }, []);

  const generateImage = async (sectionId: string) => {
    setGeneratingSection(sectionId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-training-images", {
        body: { sectionId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSectionImages((prev) => ({
        ...prev,
        [sectionId]: `${data.url}?t=${Date.now()}`,
      }));

      toast({ title: "Image generated", description: `Visual guide for section created.` });
    } catch (e: any) {
      console.error("Generate error:", e);
      toast({
        title: "Generation failed",
        description: e.message || "Failed to generate image",
        variant: "destructive",
      });
    } finally {
      setGeneratingSection(null);
    }
  };

  const generateAllImages = async () => {
    setGeneratingAll(true);
    for (const section of trainingSections) {
      if (sectionImages[section.id]) continue; // skip already generated
      await generateImage(section.id);
      // Small delay between requests to avoid rate limits
      await new Promise((r) => setTimeout(r, 2000));
    }
    setGeneratingAll(false);
    toast({ title: "All images generated", description: "Visual guides have been created for all sections." });
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Table of Contents sidebar */}
      <aside className="w-64 shrink-0 border-r bg-muted/30 hidden lg:block">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Training Guide
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Gridwise Connect</p>
        </div>
        <ScrollArea className="h-[calc(100%-10rem)]">
          <nav className="p-2 space-y-0.5">
            {trainingSections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <s.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {s.number}. {s.title}
                </span>
              </button>
            ))}
          </nav>
        </ScrollArea>
        <div className="p-3 border-t space-y-2">
          {isAdmin && (
            <Button
              onClick={generateAllImages}
              size="sm"
              variant="outline"
              className="w-full gap-2"
              disabled={generatingAll || generatingSection !== null}
            >
              {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {generatingAll ? "Generating..." : "Generate All Images"}
            </Button>
          )}
          <Button onClick={() => generateTrainingPdf(sectionImages)} size="sm" className="w-full gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Gridwise Connect — Training Guide
            </h1>
            <p className="text-sm text-muted-foreground">
              Comprehensive user guide covering all features and workflows
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button
                onClick={generateAllImages}
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={generatingAll || generatingSection !== null}
              >
                {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                <span className="hidden sm:inline">{generatingAll ? "Generating..." : "Generate Images"}</span>
              </Button>
            )}
            <Button onClick={() => generateTrainingPdf(sectionImages)} size="sm" variant="outline" className="gap-2 lg:hidden">
              <Download className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Sections */}
        <div className="max-w-4xl mx-auto p-6 space-y-10">
          {/* Intro card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm text-foreground leading-relaxed">
                Welcome to the <strong>Gridwise Connect</strong> training guide. This document covers every feature of the platform, from basic map navigation to advanced site assessment and cost estimation tools. Use the table of contents on the left to jump to any section, or scroll through the entire guide. You can also download this guide as a PDF for offline reference.
              </p>
            </CardContent>
          </Card>

          {trainingSections.map((section) => (
            <div key={section.id} id={`section-${section.id}`} className="scroll-mt-20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                    <section.icon className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">
                    {section.number}. {section.title}
                  </h2>
                </div>
                {isAdmin && !sectionImages[section.id] && (
                  <Button
                    onClick={() => generateImage(section.id)}
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-xs"
                    disabled={generatingSection !== null}
                  >
                    {generatingSection === section.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3 w-3" />
                    )}
                    Generate
                  </Button>
                )}
              </div>

              {/* Section Image */}
              {generatingSection === section.id ? (
                <Skeleton className="w-full h-48 rounded-lg mb-4" />
              ) : (
                <SectionImage sectionId={section.id} imageUrl={sectionImages[section.id]} />
              )}

              <div className="space-y-4">
                {section.content.map((sub, idx) => (
                  <Card key={idx}>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" />
                        {sub.heading}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                        {sub.body}
                      </p>
                      {sub.tips && sub.tips.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {sub.tips.map((tip, ti) => (
                            <div key={ti} className="flex items-start gap-2 text-xs text-foreground/80 bg-accent/50 rounded-md px-3 py-2">
                              <span className="shrink-0">💡</span>
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {section.id !== trainingSections[trainingSections.length - 1].id && (
                <Separator className="mt-8" />
              )}
            </div>
          ))}

          {/* Footer */}
          <Card className="border-muted">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Need additional help? Contact your Eco Power Energy administrator or email support.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-2">
                Gridwise Connect Training Guide • Eco Power Energy • {new Date().getFullYear()}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
