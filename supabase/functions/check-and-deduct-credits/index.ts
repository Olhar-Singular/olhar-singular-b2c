import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_TYPES = ["adapt", "regenerate", "chat"] as const;
type CreditType = typeof VALID_TYPES[number];

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authentication — extract user from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract JWT token from "Bearer <token>"
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Use service_role client to bypass RLS for the deduct_credits RPC
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate JWT and obtain user identity
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse and validate body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_body", details: "Request body must be valid JSON" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { amount, type, refId } = body as {
      amount?: unknown;
      type?: unknown;
      refId?: unknown;
    };

    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return new Response(
        JSON.stringify({
          error: "invalid_body",
          details: "'amount' must be an integer >= 1",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!VALID_TYPES.includes(type as CreditType)) {
      return new Response(
        JSON.stringify({
          error: "invalid_body",
          details: `'type' must be one of: ${VALID_TYPES.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (refId !== undefined && typeof refId !== "string") {
      return new Response(
        JSON.stringify({
          error: "invalid_body",
          details: "'refId' must be a string (UUID) when provided",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Call deduct_credits RPC atomically
    const rpcParams: Record<string, unknown> = {
      p_user_id: user.id,
      p_amount: amount,
      p_type: type,
    };
    if (refId !== undefined) {
      rpcParams.p_ref_id = refId;
    }

    const { data, error: rpcError } = await supabase.rpc("deduct_credits", rpcParams);

    // 4. Handle RPC-level error (unexpected DB failure)
    if (rpcError) {
      console.error("deduct_credits RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: "internal_error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Handle business-logic failures returned by the RPC
    if (data?.success === false) {
      if (data.error === "insufficient_credits") {
        return new Response(
          JSON.stringify({
            error: "insufficient_credits",
            balance: data.balance ?? 0,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (data.error === "user_not_found") {
        return new Response(
          JSON.stringify({ error: "user_not_found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Unknown failure variant — treat as internal error
      console.error("deduct_credits unexpected failure:", data);
      return new Response(
        JSON.stringify({ error: "internal_error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. Success
    return new Response(
      JSON.stringify({ success: true, newBalance: data.new_balance }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
