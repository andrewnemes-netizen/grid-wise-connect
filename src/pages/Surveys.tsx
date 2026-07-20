import { DashboardLayout } from "@/components/DashboardLayout";
import { SurveysPanel } from "@/components/surveys/SurveysPanel";

export default function SurveysPage() {
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Surveys</h1>
          <p className="text-xs text-muted-foreground">
            All site surveys across the portfolio. Detect duplicates, resend, revoke, or extend links.
          </p>
        </div>
        <SurveysPanel />
      </div>
    </DashboardLayout>
  );
}