import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { validateChangeEmailInput } from "../_shared/adminCreateUser.ts";
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

// Support fix for a typo made at checkout (no confirmation e-mail is sent to
// payers, so a wrong address locks the buyer out). The new e-mail is set as
// confirmed; the audit row never carries the address itself.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = await authorizeSuperAdmin(supabase, req.headers.get("Authorization"));
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }

    const validated = validateChangeEmailInput(body, auth.userId);
    if (!validated.ok) {
      return json({ error: validated.error }, validated.error === "cannot_change_self" ? 409 : 400);
    }
    const { userId, email } = validated.input;

    const { error } = await supabase.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code === "email_exists" || error.status === 422 || /already/i.test(error.message)) {
        return json({ error: "email_exists" }, 409);
      }
      if (error.status === 404) return json({ error: "user_not_found" }, 404);
      console.error("admin-change-email error:", error.status, error.message);
      return json({ error: "internal_error" }, 500);
    }

    await logAdminAction(supabase, { actorId: auth.userId, targetUserId: userId, action: "change_email" });

    console.info("admin-change-email:", auth.userId, "->", userId);
    return json({ success: true }, 200);
  } catch (error) {
    console.error("admin-change-email unhandled error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
