import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { inviteRedirect } from "../_shared/adminCreateUser.ts";
import { runResendInvite } from "../_shared/adminResendInvite.ts";
import { logAdminAction } from "../_shared/adminAudit.ts";
import { errorResponse } from "../_shared/publicError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Super-admin sends a pending invite again (the first link expired or got
// lost). Same e-mail, same landing page; the access kind chosen at invite
// time stays, and a trial's clock still starts only on acceptance.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:8080";

    const auth = await authorizeSuperAdmin(supabase, req.headers.get("Authorization"));
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }

    const result = await runResendInvite(body, {
      getUser: async (userId) => {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        return { user: data?.user ?? null, error };
      },
      invite: async (email) => {
        const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: inviteRedirect(appUrl) });
        return { error };
      },
      audit: (targetUserId) =>
        logAdminAction(supabase, { actorId: auth.userId, targetUserId, action: "resend_invite" }),
    });
    if (!result.ok) return json({ error: result.error }, result.status);

    console.info("admin-resend-invite:", auth.userId);
    return json({ success: true }, 200);
  } catch (error) {
    return errorResponse(error, { label: "admin-resend-invite unhandled error:", headers: corsHeaders });
  }
});
