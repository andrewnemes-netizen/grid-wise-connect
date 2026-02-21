import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Share2, UserPlus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { createNotification } from "@/hooks/useNotifications";

interface StudyShareDialogProps {
  studyId: string;
  studyName: string;
}

interface ShareRecord {
  id: string;
  shared_with: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; company: string | null } | null;
}

export function StudyShareDialog({ studyId, studyName }: StudyShareDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");

  const { data: shares, isLoading } = useQuery({
    queryKey: ["study-shares", studyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_shares")
        .select("id, shared_with, role, created_at")
        .eq("study_id", studyId);
      if (error) throw error;
      return (data || []) as ShareRecord[];
    },
    enabled: open,
  });

  const addShare = useMutation({
    mutationFn: async () => {
      // Look up user by email — we need to find their user id
      // Since we can't query auth.users, we look in profiles
      // For now, we'll accept a user ID directly or an email that matches a profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id")
        .or(`full_name.ilike.%${email}%`)
        .limit(1)
        .maybeSingle();

      if (profileError || !profile) {
        throw new Error("User not found. They must have an account on the platform.");
      }

      const { error } = await supabase.from("study_shares").insert({
        study_id: studyId,
        shared_with: profile.user_id,
        shared_by: user!.id,
        role,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Already shared with this user");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-shares", studyId] });
      // Find the shared user id from the last mutation context
      const profileLookup = async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .or(`full_name.ilike.%${email}%`)
          .limit(1)
          .maybeSingle();
        if (profile) {
          await createNotification({
            userId: profile.user_id,
            studyId,
            type: "study_share",
            message: `You were given ${role} access to "${studyName}"`,
          });
        }
      };
      profileLookup();
      setEmail("");
      toast.success("Study shared successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeShare = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.from("study_shares").delete().eq("id", shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-shares", studyId] });
      toast.success("Share removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4 mr-2" />Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share "{studyName}"
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Name or email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Search by name…"
                className="h-8 text-sm"
              />
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                disabled={!email.trim() || addShare.isPending}
                onClick={() => addShare.mutate()}
                className="h-8"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shared with</p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !shares?.length ? (
              <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
            ) : (
              <div className="space-y-1">
                {shares.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.shared_with.slice(0, 8)}…</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{s.role}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeShare.mutate(s.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
