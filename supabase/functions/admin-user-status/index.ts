import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { validateStatusInput, banDurationFor } from "../_shared/adminUserStatus.ts";

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

    const validated = validateStatusInput(body, auth.userId);
    if (!validated.ok) {
      const status = validated.error === "cannot_ban_self" ? 409 : 400;
      return json({ error: validated.error }, status);
    }

    const { userId, action } = validated.input;
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: banDurationFor(action),
    });
    if (error) {
      console.error("admin-user-status updateUserById error:", error);
      return json({ error: "internal_error" }, 500);
    }

    return json({ success: true, userId, action, is_active: action === "unban" }, 200);
  } catch (error) {
    console.error("admin-user-status unhandled error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
