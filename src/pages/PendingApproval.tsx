import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import epeLogo from "@/assets/epe-logo.png";

const PendingApproval = () => {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-3">
            <img src={epeLogo} alt="Eco Power Energy" className="h-12 mx-auto" width={205} height={48} />
          </div>
          <div className="mx-auto mb-2">
            <Clock className="h-10 w-10 text-amber-500" />
          </div>
          <CardTitle className="text-xl">Account Pending Approval</CardTitle>
          <CardDescription>
            Your account has been created but needs to be approved by an administrator before you can access the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You'll be notified once your account has been approved. If you have questions, contact your administrator.
          </p>
          <Button variant="outline" onClick={signOut} className="w-full">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
