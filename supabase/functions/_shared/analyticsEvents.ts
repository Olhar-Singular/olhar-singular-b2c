// Server-side conversion events: GA4 Measurement Protocol and Meta Conversions
// API. Pure builders plus a sender that is a no-op without the secrets, never
// throws, respects the consent captured with the attribution, and gives up
// after 3 seconds. event_id equals the browser event's, so both ends dedupe.

export interface ConsentLike {
  analytics_storage?: string;
  ad_storage?: string;
  ad_user_data?: string;
  ad_personalization?: string;
}

export interface AttributionLike {
  ga_client_id?: string;
  fbp?: string;
  fbc?: string;
  consent?: ConsentLike;
  [key: string]: unknown;
}

export type AnalyticsEventName =
  | "purchase"
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_payment_failed"
  | "subscription_cancelled"
  | "refund";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  /** Purchase / subscription id: dedupe key with the browser hit. */
  eventId: string;
  userId: string;
  valueBrl: number | null;
  /** Only hashed, only for Meta, only with ad_user_data granted. */
  email?: string | null;
  attribution?: AttributionLike | null;
  params?: Record<string, string | number | boolean>;
}

export interface AnalyticsConfig {
  ga4MeasurementId?: string;
  ga4ApiSecret?: string;
  metaPixelId?: string;
  metaCapiToken?: string;
}

const META_EVENT_NAMES: Record<AnalyticsEventName, string> = {
  purchase: "Purchase",
  subscription_started: "Subscribe",
  subscription_renewed: "Purchase",
  subscription_payment_failed: "SubscriptionPaymentFailed",
  subscription_cancelled: "SubscriptionCancelled",
  refund: "Refund",
};

export function readAnalyticsConfig(env: { get(name: string): string | undefined }): AnalyticsConfig {
  return {
    ga4MeasurementId: env.get("GA4_MEASUREMENT_ID") || undefined,
    ga4ApiSecret: env.get("GA4_API_SECRET") || undefined,
    metaPixelId: env.get("META_PIXEL_ID") || undefined,
    metaCapiToken: env.get("META_CAPI_TOKEN") || undefined,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// GA4 MP needs a client_id; without analytics consent we send only the
// user_id (pseudonymous account id), never the browser's cookie id.
export function buildGa4Payload(event: AnalyticsEvent): Record<string, unknown> {
  const consent = event.attribution?.consent;
  const analyticsGranted = consent?.analytics_storage === "granted";
  const clientId = analyticsGranted && event.attribution?.ga_client_id ? event.attribution.ga_client_id : `server.${event.userId}`;
  const params: Record<string, unknown> = {
    event_id: event.eventId,
    transaction_id: event.eventId,
    currency: "BRL",
    ...(event.valueBrl !== null ? { value: event.valueBrl } : {}),
    ...(event.params ?? {}),
  };
  return {
    client_id: clientId,
    user_id: event.userId,
    non_personalized_ads: consent?.ad_personalization !== "granted",
    events: [{ name: event.name, params }],
  };
}

export async function buildMetaPayload(event: AnalyticsEvent, now: Date): Promise<Record<string, unknown>> {
  const consent = event.attribution?.consent;
  const adsGranted = consent?.ad_storage === "granted";
  const userDataGranted = consent?.ad_user_data === "granted";
  const userData: Record<string, unknown> = { external_id: [await sha256Hex(event.userId)] };
  if (userDataGranted && event.email) userData.em = [await sha256Hex(event.email)];
  if (adsGranted && event.attribution?.fbp) userData.fbp = event.attribution.fbp;
  if (adsGranted && event.attribution?.fbc) userData.fbc = event.attribution.fbc;
  return {
    data: [
      {
        event_name: META_EVENT_NAMES[event.name],
        event_time: Math.floor(now.getTime() / 1000),
        event_id: event.eventId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: "BRL",
          ...(event.valueBrl !== null ? { value: event.valueBrl } : {}),
          ...(event.params ?? {}),
        },
      },
    ],
  };
}

export const ANALYTICS_TIMEOUT_MS = 3000;

interface WaitUntilHost {
  EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
}

/**
 * Keeps the analytics send off the response path: on the Supabase edge runtime
 * the promise is handed to EdgeRuntime.waitUntil (runs after the response);
 * elsewhere it is awaited so nothing is lost. Never throws.
 */
export async function dispatchAnalytics(send: Promise<void>, host: WaitUntilHost = globalThis as WaitUntilHost): Promise<void> {
  const waitUntil = host.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(send);
    return;
  }
  await send;
}

async function postWithTimeout(fetchFn: typeof fetch, url: string, body: unknown, log: (m: string, ...a: unknown[]) => void): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYTICS_TIMEOUT_MS);
  try {
    const resp = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) log("analytics: endpoint answered", resp.status, url.split("?")[0]);
  } catch (e) {
    log("analytics: send failed", url.split("?")[0], e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the events to whichever destinations are configured. Never throws
 * and never blocks the caller for more than the timeout.
 */
export async function sendAnalyticsEvents(
  events: AnalyticsEvent[],
  config: AnalyticsConfig,
  fetchFn: typeof fetch = fetch,
  log: (message: string, ...args: unknown[]) => void = console.warn,
  now: Date = new Date(),
): Promise<void> {
  if (events.length === 0) return;
  const jobs: Promise<void>[] = [];

  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(config.ga4MeasurementId)}&api_secret=${encodeURIComponent(config.ga4ApiSecret)}`;
    for (const event of events) jobs.push(postWithTimeout(fetchFn, url, buildGa4Payload(event), log));
  }

  if (config.metaPixelId && config.metaCapiToken) {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(config.metaPixelId)}/events?access_token=${encodeURIComponent(config.metaCapiToken)}`;
    for (const event of events) {
      jobs.push(buildMetaPayload(event, now).then((payload) => postWithTimeout(fetchFn, url, payload, log)));
    }
  }

  await Promise.all(jobs);
}
