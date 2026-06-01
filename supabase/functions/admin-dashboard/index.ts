import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import {
  mergeUserRows,
  shapeSeries,
  type AuthUserLite,
  type ProfileLite,
  type SpendingLite,
  type SeriesRow,
} from "../_shared/adminDashboard.ts";

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

const DAILY_BUCKETS = 30;
const MONTHLY_BUCKETS = 12;
const USERS_PER_PAGE = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = await authorizeSuperAdmin(supabase, req.headers.get("Authorization"));
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    // Platform cost metrics (USD).
    const [summaryRes, dailyRes, monthlyRes, spendingRes] = await Promise.all([
      supabase.rpc("admin_cost_summary"),
      supabase.rpc("admin_cost_series", { p_granularity: "day", p_buckets: DAILY_BUCKETS }),
      supabase.rpc("admin_cost_series", { p_granularity: "month", p_buckets: MONTHLY_BUCKETS }),
      supabase.rpc("admin_user_spending"),
    ]);

    const firstError = summaryRes.error || dailyRes.error || monthlyRes.error || spendingRes.error;
    if (firstError) {
      console.error("admin-dashboard rpc error:", firstError);
      return json({ error: "internal_error" }, 500);
    }

    const summary = (summaryRes.data?.[0] ?? {}) as { total_usd?: number | string; today_usd?: number | string; month_usd?: number | string };

    // Auth users (email, last_sign_in_at, banned_until) — paginated.
    const authUsers: AuthUserLite[] = [];
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
      if (error) {
        console.error("admin-dashboard listUsers error:", error);
        return json({ error: "internal_error" }, 500);
      }
      const batch = data?.users ?? [];
      for (const u of batch) {
        authUsers.push({
          id: u.id,
          email: u.email ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: (u as { banned_until?: string | null }).banned_until ?? null,
          created_at: u.created_at ?? null,
        });
      }
      if (batch.length < USERS_PER_PAGE) break;
      page += 1;
    }

    // Profiles (name, credit balance, admin flag).
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, credit_balance, is_super_admin");
    if (profilesError) {
      console.error("admin-dashboard profiles error:", profilesError);
      return json({ error: "internal_error" }, 500);
    }

    const now = new Date();
    const users = mergeUserRows(
      authUsers,
      (profilesData ?? []) as ProfileLite[],
      (spendingRes.data ?? []) as SpendingLite[],
      now,
    );

    return json(
      {
        metrics: {
          total_usd: Number(summary.total_usd ?? 0),
          today_usd: Number(summary.today_usd ?? 0),
          month_usd: Number(summary.month_usd ?? 0),
          daily: shapeSeries((dailyRes.data ?? []) as SeriesRow[]),
          monthly: shapeSeries((monthlyRes.data ?? []) as SeriesRow[]),
        },
        users,
      },
      200,
    );
  } catch (error) {
    console.error("admin-dashboard unhandled error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
