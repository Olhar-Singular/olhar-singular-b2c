import { describe, it, expect, vi } from "vitest";
import {
  buildGa4Payload,
  buildMetaPayload,
  readAnalyticsConfig,
  sendAnalyticsEvents,
  sha256Hex,
  type AnalyticsEvent,
} from "./analyticsEvents";

const GRANTED = { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" };
const DENIED = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
const NOW = new Date("2026-09-14T10:00:00Z");

function event(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    name: "subscription_started",
    eventId: "sub-1",
    userId: "u1",
    valueBrl: 59.9,
    email: "Ana@Example.com",
    attribution: { ga_client_id: "1.2", fbp: "fbp1", fbc: "fbc1", consent: GRANTED, utm_source: "meta" },
    params: { plan: "profissional" },
    ...overrides,
  };
}

describe("readAnalyticsConfig", () => {
  it("reads the four secrets and treats empty as missing", () => {
    const env = { get: (n: string) => ({ GA4_MEASUREMENT_ID: "G-1", GA4_API_SECRET: "", META_PIXEL_ID: "px" } as Record<string, string>)[n] };
    expect(readAnalyticsConfig(env)).toEqual({ ga4MeasurementId: "G-1", ga4ApiSecret: undefined, metaPixelId: "px", metaCapiToken: undefined });
    expect(readAnalyticsConfig({ get: () => undefined })).toEqual({ ga4MeasurementId: undefined, ga4ApiSecret: undefined, metaPixelId: undefined, metaCapiToken: undefined });
  });
});

describe("sha256Hex", () => {
  it("normalises and hashes", async () => {
    expect(await sha256Hex(" Ana@Example.com ")).toBe(await sha256Hex("ana@example.com"));
    expect(await sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildGa4Payload", () => {
  it("uses the GA client id and value with consent", () => {
    expect(buildGa4Payload(event())).toEqual({
      client_id: "1.2",
      user_id: "u1",
      non_personalized_ads: false,
      events: [{ name: "subscription_started", params: { event_id: "sub-1", transaction_id: "sub-1", currency: "BRL", value: 59.9, plan: "profissional" } }],
    });
  });

  it("falls back to a server client id without analytics consent or without a cookie, and omits a null value", () => {
    expect(buildGa4Payload(event({ attribution: { ga_client_id: "1.2", consent: DENIED } }))).toMatchObject({ client_id: "server.u1", non_personalized_ads: true });
    expect(buildGa4Payload(event({ attribution: { consent: GRANTED } }))).toMatchObject({ client_id: "server.u1" });
    const noValue = buildGa4Payload(event({ attribution: null, valueBrl: null, params: undefined }));
    expect(noValue).toMatchObject({ client_id: "server.u1", non_personalized_ads: true });
    expect((noValue.events as { params: Record<string, unknown> }[])[0].params).toEqual({ event_id: "sub-1", transaction_id: "sub-1", currency: "BRL" });
  });
});

describe("buildMetaPayload", () => {
  it("hashes e-mail and forwards fbp/fbc only with consent", async () => {
    const granted = await buildMetaPayload(event(), NOW);
    const data = (granted.data as Record<string, unknown>[])[0];
    expect(data).toMatchObject({ event_name: "Subscribe", event_time: 1789380000, event_id: "sub-1", action_source: "website" });
    expect(data.user_data).toEqual({ external_id: [await sha256Hex("u1")], em: [await sha256Hex("ana@example.com")], fbp: "fbp1", fbc: "fbc1" });
    expect(data.custom_data).toEqual({ currency: "BRL", value: 59.9, plan: "profissional" });

    const denied = await buildMetaPayload(event({ attribution: { fbp: "fbp1", fbc: "fbc1", consent: DENIED } }), NOW);
    expect((denied.data as Record<string, unknown>[])[0].user_data).toEqual({ external_id: [await sha256Hex("u1")] });

    const noEmail = await buildMetaPayload(event({ email: null, valueBrl: null, params: undefined, attribution: { consent: GRANTED } }), NOW);
    const noEmailData = (noEmail.data as Record<string, unknown>[])[0];
    expect(noEmailData.user_data).toEqual({ external_id: [await sha256Hex("u1")] });
    expect(noEmailData.custom_data).toEqual({ currency: "BRL" });
  });

  it("maps every event name", async () => {
    for (const [name, expected] of [["purchase", "Purchase"], ["subscription_renewed", "Purchase"], ["subscription_payment_failed", "SubscriptionPaymentFailed"], ["subscription_cancelled", "SubscriptionCancelled"], ["refund", "Refund"]] as const) {
      const payload = await buildMetaPayload(event({ name }), NOW);
      expect((payload.data as Record<string, unknown>[])[0].event_name).toBe(expected);
    }
  });
});

describe("sendAnalyticsEvents", () => {
  it("is a no-op without secrets or events", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    await sendAnalyticsEvents([event()], {}, fetchFn);
    await sendAnalyticsEvents([], { ga4MeasurementId: "G", ga4ApiSecret: "s" }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts to GA4 and Meta when both are configured", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const log = vi.fn();
    await sendAnalyticsEvents([event()], { ga4MeasurementId: "G-1", ga4ApiSecret: "sec", metaPixelId: "px", metaCapiToken: "tok" }, fetchFn, log, NOW);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const urls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-1&api_secret=sec");
    expect(urls[1]).toBe("https://graph.facebook.com/v19.0/px/events?access_token=tok");
    expect(log).not.toHaveBeenCalled();
  });

  it("logs non-2xx answers and network failures without throwing", async () => {
    const log = vi.fn();
    const failing = vi.fn(async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    await sendAnalyticsEvents([event()], { ga4MeasurementId: "G-1", ga4ApiSecret: "sec" }, failing, log);
    expect(log).toHaveBeenCalledWith("analytics: endpoint answered", 400, "https://www.google-analytics.com/mp/collect");

    const throwing = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(sendAnalyticsEvents([event()], { metaPixelId: "px", metaCapiToken: "tok" }, throwing, log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("analytics: send failed", "https://graph.facebook.com/v19.0/px/events", "fetch failed");

    const throwingValue = vi.fn(async () => { throw "weird"; }) as unknown as typeof fetch;
    await sendAnalyticsEvents([event()], { metaPixelId: "px", metaCapiToken: "tok" }, throwingValue, log);
    expect(log).toHaveBeenCalledWith("analytics: send failed", expect.any(String), "weird");
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const hanging = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    ) as unknown as typeof fetch;
    const pending = sendAnalyticsEvents([event()], { ga4MeasurementId: "G-1", ga4ApiSecret: "sec" }, hanging, log);
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    expect(log).toHaveBeenCalledWith("analytics: send failed", expect.any(String), "aborted");
    vi.useRealTimers();
  });

  it("uses the global fetch, console.warn and clock by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sendAnalyticsEvents([event()], { ga4MeasurementId: "G-1", ga4ApiSecret: "sec" });
    expect(spy).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    spy.mockRestore();
    warn.mockRestore();
  });
});
