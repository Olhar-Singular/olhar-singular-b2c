import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parsePasswordInput, runSetInitialPassword } from "../_shared/setInitialPassword.ts";

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

const INPUT_ERRORS: Record<string, string> = {
  invalid_body: "Requisição inválida.",
  password_too_short: "A senha precisa ter pelo menos 6 caracteres.",
  password_too_long: "A senha é longa demais.",
};

// First access of an account born from a payment: the user picks a password,
// the must_set_password flag is cleared and every other session is revoked.
// The password only ever travels in this request body and is never logged.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);
    const jwt = authHeader.slice("Bearer ".length).trim();

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Não autorizado." }, 401);

    const parsed = parsePasswordInput(await req.json());
    if (!parsed.ok) return json({ error: INPUT_ERRORS[parsed.error], code: parsed.error }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const outcome = await runSetInitialPassword(user.id, parsed.password, {
      updatePassword: async (userId, password) => {
        const { error } = await admin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { ...(user.user_metadata ?? {}), must_set_password: false },
        });
        if (error) throw new Error(error.message);
      },
      clearFlag: async (userId) => {
        const { error } = await admin.from("profiles").update({ must_set_password: false }).eq("id", userId);
        if (error) throw new Error(`must_set_password clear failed: ${error.message}`);
      },
      revokeOtherSessions: async () => {
        const { error } = await admin.auth.admin.signOut(jwt, "others");
        if (error) throw new Error(error.message);
      },
      log: (message, ...args) => console.warn(message, ...args),
    });

    return json({ ok: true, flagCleared: outcome.flagCleared });
  } catch (e) {
    console.error("set-initial-password error:", e instanceof Error ? e.message : e);
    // GoTrue's messages are English and can mention the password rule; keep it generic.
    return json({ error: "Não foi possível definir a senha. Tente de novo." }, 500);
  }
});
