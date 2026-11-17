import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { publicPlanStatus } from "../_shared/pixPlanSettlement.ts";
import { errorResponse } from "../_shared/publicError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the QR screen polls (R5): an anonymous buyer has no session to read
// credit_purchases through RLS. Answers only pending/approved/failed of a plan
// purchase; the id is an unguessable uuid and nothing else about the row leaks.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const purchaseId = (body as { purchaseId?: unknown } | null)?.purchaseId;
    if (typeof purchaseId !== "string" || !UUID_RE.test(purchaseId)) return json({ error: "Compra inválida." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.from("credit_purchases").select("kind, status").eq("id", purchaseId).maybeSingle();
    if (error) throw new Error(`credit_purchases lookup failed: ${error.message}`);

    const status = publicPlanStatus(data);
    if (!status) return json({ error: "Compra não encontrada." }, 404);
    return json({ status });
  } catch (e) {
    return errorResponse(e, { label: "pix-plan-status error:", headers: corsHeaders });
  }
});
