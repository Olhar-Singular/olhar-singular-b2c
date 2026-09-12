import { describe, it, expect, vi } from "vitest";
import { buildSubscriptionActionDeps, type SubscriptionAdminClient } from "./subscriptionActionDeps";

function fakeAdmin(overrides: { row?: unknown; rpc?: { data: unknown; error: { message: string } | null }; updateError?: { message: string } | null } = {}) {
  const maybeSingle = vi.fn(async () => ({ data: overrides.row ?? null }));
  const inFn = vi.fn(() => ({ maybeSingle }));
  const selectEq = vi.fn(() => ({ in: inFn }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn(async () => ({ error: overrides.updateError ?? null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({ select, update }));
  const rpc = vi.fn(async () => overrides.rpc ?? { data: { success: true }, error: null });
  const client = { from, rpc } as unknown as SubscriptionAdminClient;
  return { client, from, select, selectEq, inFn, update, updateEq, rpc };
}

function fakeFetch(status: number, json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
}

const NOW = () => new Date("2026-09-14T10:00:00Z");

describe("buildSubscriptionActionDeps", () => {
  it("looks the live subscription up by user and live statuses", async () => {
    const row = { id: "s1", mp_preapproval_id: "p1", status: "authorized" };
    const a = fakeAdmin({ row });
    const deps = buildSubscriptionActionDeps(a.client, "tok", fakeFetch(200, {}), NOW);
    expect(await deps.findLiveSubscription("u1")).toEqual(row);
    expect(a.from).toHaveBeenCalledWith("subscriptions");
    expect(a.select).toHaveBeenCalledWith("id, mp_preapproval_id, status");
    expect(a.selectEq).toHaveBeenCalledWith("user_id", "u1");
    expect(a.inFn).toHaveBeenCalledWith("status", ["authorized", "past_due", "paused"]);
  });

  it("PUTs the preapproval with the bearer token and returns the parsed body", async () => {
    const f = fakeFetch(200, { id: "p1", status: "cancelled" });
    const deps = buildSubscriptionActionDeps(fakeAdmin().client, "tok", f, NOW);
    const out = await deps.putPreapproval("p 1", { status: "cancelled" });
    expect(f).toHaveBeenCalledWith("https://api.mercadopago.com/preapproval/p%201", {
      method: "PUT",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(out).toEqual({ ok: true, status: 200, json: { id: "p1", status: "cancelled" } });
  });

  it("tolerates a non-JSON error body from MP", async () => {
    const f = vi.fn(async () => new Response("gateway timeout", { status: 504 })) as unknown as typeof fetch;
    const deps = buildSubscriptionActionDeps(fakeAdmin().client, "tok", f, NOW);
    expect(await deps.putPreapproval("p1", {})).toEqual({ ok: false, status: 504, json: {} });
  });

  it("cancels locally through cancel_subscription_local with the current time", async () => {
    const a = fakeAdmin({ rpc: { data: { success: true, result: "cancelled" }, error: null } });
    const deps = buildSubscriptionActionDeps(a.client, "tok", fakeFetch(200, {}), NOW);
    expect(await deps.cancelLocal("s1")).toEqual({ success: true, result: "cancelled" });
    expect(a.rpc).toHaveBeenCalledWith("cancel_subscription_local", {
      p_subscription_id: "s1",
      p_cancelled_at: "2026-09-14T10:00:00.000Z",
    });
  });

  it("surfaces an RPC error instead of pretending the cancel succeeded", async () => {
    const a = fakeAdmin({ rpc: { data: null, error: { message: "boom" } } });
    const deps = buildSubscriptionActionDeps(a.client, "tok", fakeFetch(200, {}), NOW);
    await expect(deps.cancelLocal("s1")).rejects.toThrow("cancel_subscription_local failed: boom");
  });

  it("mirrors only the card fields MP reported", async () => {
    const a = fakeAdmin();
    const deps = buildSubscriptionActionDeps(a.client, "tok", fakeFetch(200, {}), NOW);
    await deps.updateCard({ subscriptionId: "s1", cardBrand: "visa", cardLastFour: "4321" });
    expect(a.update).toHaveBeenCalledWith({ card_brand: "visa", card_last_four: "4321" });
    expect(a.updateEq).toHaveBeenCalledWith("id", "s1");

    a.update.mockClear();
    await deps.updateCard({ subscriptionId: "s1", cardBrand: null, cardLastFour: "9999" });
    expect(a.update).toHaveBeenCalledWith({ card_last_four: "9999" });

    a.update.mockClear();
    await deps.updateCard({ subscriptionId: "s1", cardBrand: null, cardLastFour: null });
    expect(a.update).not.toHaveBeenCalled();
  });

  it("surfaces a failed card mirror", async () => {
    const a = fakeAdmin({ updateError: { message: "denied" } });
    const deps = buildSubscriptionActionDeps(a.client, "tok", fakeFetch(200, {}), NOW);
    await expect(deps.updateCard({ subscriptionId: "s1", cardBrand: "visa", cardLastFour: null })).rejects.toThrow("subscriptions card update failed: denied");
  });

  it("logs through console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    buildSubscriptionActionDeps(fakeAdmin().client, "tok", fakeFetch(200, {}), NOW).log("hello", 1);
    expect(warn).toHaveBeenCalledWith("hello", 1);
    warn.mockRestore();
  });

  it("defaults to the global fetch and clock", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const a = fakeAdmin();
    const deps = buildSubscriptionActionDeps(a.client, "tok");
    await deps.putPreapproval("p1", {});
    expect(globalFetch).toHaveBeenCalled();
    await deps.cancelLocal("s1");
    expect(a.rpc).toHaveBeenCalledWith("cancel_subscription_local", expect.objectContaining({ p_cancelled_at: expect.any(String) }));
    globalFetch.mockRestore();
  });
});
