import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { validateSetAccessInput } from "../_shared/adminSetAccess.ts";

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

// Super-admin support actions on a user's access: move between trial /
// courtesy (exempt) / legacy, or extend a running trial. 'subscriber' is never
// set here: that state is produced by the subscription flow only.
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

    const validated = validateSetAccessInput(body, auth.userId);
    if (!validated.ok) {
      const status = validated.error === "cannot_change_self" ? 409
        : validated.error === "invalid_body" ? 400 : 422;
      return json({ error: validated.error }, status);
    }

    const input = validated.input;
    const { data, error } = input.action === "set_kind"
      ? await supabase.rpc("admin_set_access_kind", { p_user_id: input.userId, p_kind: input.kind })
      : await supabase.rpc("admin_extend_trial", { p_user_id: input.userId, p_days: input.days });

    if (error) {
      console.error("admin-set-access rpc error:", error);
      return json({ error: "internal_error" }, 500);
    }

    if (data?.success === false) {
      if (data.error === "user_not_found") return json({ error: "user_not_found" }, 404);
      // not_a_trial, trial_limit_reached, invalid_days, invalid_kind: the caller can act on these.
      return json({ error: data.error ?? "internal_error" }, 422);
    }

    console.info("admin-set-access:", auth.userId, "->", input.userId, input.action);
    return json({ success: true, ...data }, 200);
  } catch (error) {
    console.error("admin-set-access unhandled error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
