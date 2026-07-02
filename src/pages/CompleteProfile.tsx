import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import epeLogo from "@/assets/epe-logo.png";

const CompleteProfile = ({ onComplete }: { onComplete: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || "");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadExistingProfile = async () => {
      if (!user) return;
      const { data: rows } = await supabase.rpc("get_own_profile");
      const data = Array.isArray(rows) ? rows[0] : null;
      if (!data) return;
      if (data.full_name?.trim()) setFullName(data.full_name);
      if (data.company?.trim()) setCompany(data.company);
      if (data.phone?.trim()) setPhone(data.phone);
    };

    loadExistingProfile();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      full_name: fullName.trim(),
      company: company.trim(),
      phone: phone.trim(),
    };

    setLoading(true);

    const { data: updatedRow, error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      setLoading(false);
      toast({ title: "Error", description: updateError.message, variant: "destructive" });
      return;
    }

    if (!updatedRow) {
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({ user_id: user.id, ...payload });

      if (insertError) {
        setLoading(false);
        toast({ title: "Error", description: insertError.message, variant: "destructive" });
        return;
      }
    }

    setLoading(false);
    onComplete();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3">
            <img src={epeLogo} alt="Eco Power Energy" className="h-12 mx-auto" width={205} height={48} />
          </div>
          <CardTitle className="text-xl">Complete Your Profile</CardTitle>
          <CardDescription>We need a few more details before you can get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cp-name">Full Name</Label>
              <Input id="cp-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-company">Company / Organisation</Label>
              <Input id="cp-company" value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="e.g. Eco Power Energy" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-phone">Phone Number</Label>
              <Input id="cp-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="e.g. 07700 900000" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompleteProfile;
