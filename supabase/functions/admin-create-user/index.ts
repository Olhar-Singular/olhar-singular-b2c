import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { inviteRedirect, validateCreateUserInput } from "../_shared/adminCreateUser.ts";
import { logAdminAction } from "../_shared/adminAudit.ts";

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

// Super-admin creates an account by invite (decision 15): Trial (7 days and 50
// credits, clock starting when the invite is accepted) or Cortesia (exempt).
// handle_new_user reads access_kind from the metadata; the invite e-mail lands
// on /redefinir-senha?convite=1 where the person creates the password.
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

    const validated = validateCreateUserInput(body);
    if (!validated.ok) return json({ error: validated.error }, 400);
    const { email, fullName, mode } = validated.input;

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, access_kind: mode },
      redirectTo: inviteRedirect(appUrl),
    });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code === "email_exists" || error.status === 422 || /already/i.test(error.message)) {
        return json({ error: "email_exists" }, 409);
      }
      console.error("admin-create-user invite error:", error.status, error.message);
      return json({ error: "internal_error" }, 500);
    }

    // Belt and braces: the trigger sets it from the metadata, but an older row
    // (re-invite of a deleted account) would otherwise keep its previous kind.
    const { error: kindError } = await supabase
      .from("profiles")
      .update({ access_kind: mode, full_name: fullName })
      .eq("id", data.user.id);
    if (kindError) console.error("admin-create-user profile update failed:", data.user.id, kindError.message);

    await logAdminAction(supabase, { actorId: auth.userId, targetUserId: data.user.id, action: "create_user", payload: { mode } });

    console.info("admin-create-user:", auth.userId, "->", data.user.id, mode);
    return json({ success: true, userId: data.user.id, mode }, 200);
  } catch (error) {
    console.error("admin-create-user unhandled error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
