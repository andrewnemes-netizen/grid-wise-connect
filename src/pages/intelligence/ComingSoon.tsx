import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <Card className="p-10 text-center">
      <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary/60" />
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground mt-1 max-w-lg mx-auto">{note}</div>
    </Card>
  );
}
