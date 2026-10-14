import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { normalizeAppUrl } from "../_shared/appUrl.ts";
import { authorizeCron } from "../_shared/cronAuth.ts";
import { readEmailConfig, sendEmail } from "../_shared/email.ts";
import { runTrialReminders, toTrialReminderRow, type ClaimedTrialReminderRaw } from "../_shared/trialReminder.ts";
import { errorResponse, INTERNAL_ERROR_CODE, INTERNAL_ERROR_MESSAGE } from "../_shared/publicError.ts";

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

// Hourly job (pg_cron → pg_net → here): e-mails the card trials whose first
// charge is within 48 h. No user session: the caller is our scheduler, proven
// by `Authorization: Bearer <CRON_SECRET>` (verify_jwt = false in config.toml).
// Decisions live in runTrialReminders (unit-tested) and in the RPCs
// claim_trial_reminders / release_trial_reminder (pgTAP); this file only wires
// Supabase and the e-mail sender into them.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const auth = authorizeCron(req.headers.get("Authorization"), Deno.env.get("CRON_SECRET"));
    if (auth === "misconfigured") {
      console.error("send-trial-reminders: CRON_SECRET not set (runbook docs/runbooks/lembrete-teste-gratis.md)");
      return json({ error: INTERNAL_ERROR_MESSAGE, code: INTERNAL_ERROR_CODE }, 500);
    }
    if (auth === "unauthorized") return json({ error: "Não autorizado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl      = normalizeAppUrl(Deno.env.get("APP_URL"));
    const admin = createClient(supabaseUrl, serviceKey);
    // Successes in console.log (info), failures and skips in console.warn.
    const info = (message: string, ...args: unknown[]) => console.log(message, ...args);
    const warn = (message: string, ...args: unknown[]) => console.warn(message, ...args);
    const emailDeps = { fetch, config: readEmailConfig(Deno.env), log: warn, info };

    const summary = await runTrialReminders({
      claim: async () => {
        const { data, error } = await admin.rpc("claim_trial_reminders");
        if (error) throw new Error(`claim_trial_reminders failed: ${error.message}`);
        return ((data ?? []) as ClaimedTrialReminderRaw[]).map(toTrialReminderRow);
      },
      release: async (subscriptionId) => {
        const { error } = await admin.rpc("release_trial_reminder", { p_subscription_id: subscriptionId });
        if (error) throw new Error(`release_trial_reminder failed: ${error.message}`);
      },
      sendEmail: (message) => sendEmail(emailDeps, message),
      log: warn,
      info,
      appUrl,
    });

    console.log("send-trial-reminders: run finished", summary);
    return json(summary);
  } catch (e) {
    return errorResponse(e, { label: "send-trial-reminders error:", headers: corsHeaders });
  }
});
