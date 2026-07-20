import { useParams } from "react-router-dom";
import { SurveysPanel } from "@/components/surveys/SurveysPanel";

export default function WpSurveysTab() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <SurveysPanel workPackageId={id} />;
}