import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { validateGrantInput } from "../_shared/adminGrantCredits.ts";

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

    const validated = validateGrantInput(body);
    if (!validated.ok) {
      const status = validated.error === "invalid_amount" ? 422 : 400;
      return json({ error: validated.error }, status);
    }

    const { data, error } = await supabase.rpc("admin_grant_credits", {
      p_user_id: validated.input.userId,
      p_amount: validated.input.amount,
    });

    if (error) {
      console.error("admin-grant-credits rpc error:", error);
      return json({ error: "internal_error" }, 500);
    }

    if (data?.success === false) {
      if (data.error === "user_not_found") return json({ error: "user_not_found" }, 404);
      console.error("admin-grant-credits unexpected failure:", data);
      return json({ error: "internal_error" }, 500);
    }

    return json({ success: true, new_balance: data.new_balance }, 200);
  } catch (error) {
    console.error("admin-grant-credits unhandled error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
