import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Unauthorized");

    const { data: callerRoles } = await callerClient.from("user_roles").select("role").eq("user_id", caller.id);
    if (!callerRoles?.some((r: any) => r.role === "admin")) throw new Error("Admin only");

    const { email, password, full_name, company, org_id, role } = await req.json();
    if (!email || !password || !org_id) throw new Error("email, password, and org_id are required");

    const admin = createClient(supabaseUrl, serviceKey);

    // Create user
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });
    if (createErr) throw createErr;

    const userId = newUser.user.id;

    // Create profile
    await admin.from("profiles").insert({
      user_id: userId,
      full_name: full_name || null,
      company: company || null,
      is_approved: true,
    });

    // Add to org
    await admin.from("org_members").insert({
      org_id,
      user_id: userId,
      role: "member",
    });

    // Assign app role (default to client)
    const appRole = role || "client";
    await admin.from("user_roles").insert({
      user_id: userId,
      role: appRole,
    });

    // Get org name for the email
    const { data: orgData } = await admin.from("organisations").select("name").eq("id", orgId).single();
    const orgNameResolved = orgData?.name || "";

    // Send welcome email via transactional email system
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "welcome-client",
          recipientEmail: email,
          idempotencyKey: `welcome-client-${userId}`,
          templateData: {
            name: full_name || email,
            email,
            password,
            company: company || "",
            orgName: orgNameResolved,
            loginUrl: "https://grid-wise-connect.lovable.app/auth",
          },
        },
      });
    } catch (emailErr: any) {
      console.warn("Welcome email failed (user still created):", emailErr.message);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
