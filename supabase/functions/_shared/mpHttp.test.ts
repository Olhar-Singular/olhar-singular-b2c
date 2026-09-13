import { describe, it, expect, vi } from "vitest";
import { cancelPreapprovalAtMp, MpTimeoutError, mpRequest } from "./mpHttp";

describe("mpRequest", () => {
  it("builds the URL, headers and JSON body, and parses the answer", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 201 })) as unknown as typeof fetch;
    const out = await mpRequest("/preapproval", { method: "POST", token: "tok", body: { a: 1 }, idempotencyKey: "k" }, fetchFn);
    expect(out).toEqual({ ok: true, status: 201, json: { id: 1 } });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer tok", "Content-Type": "application/json", "X-Idempotency-Key": "k" });
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("defaults to GET without a body and tolerates a non-JSON answer", async () => {
    const fetchFn = vi.fn(async () => new Response("gateway", { status: 502 })) as unknown as typeof fetch;
    const out = await mpRequest("/v1/payments/1", { token: "tok" }, fetchFn);
    expect(out).toEqual({ ok: false, status: 502, json: {} });
    const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
    expect(init.body).toBeUndefined();
  });

  it("throws MpTimeoutError when the call outlives the timeout, and passes other errors through", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    ) as unknown as typeof fetch;
    const pending = mpRequest("/slow", { token: "t", timeoutMs: 50 }, hanging);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).rejects.toBeInstanceOf(MpTimeoutError);
    vi.useRealTimers();

    const failing = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(mpRequest("/x", { token: "t" }, failing)).rejects.toThrow("fetch failed");
  });

  it("uses the global fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await mpRequest("/x", { token: "t" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("cancelPreapprovalAtMp", () => {
  it("PUTs the cancelled status and reports the outcome without throwing", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect(await cancelPreapprovalAtMp("p 1", "tok", ok)).toBe(true);
    const [url, init] = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval/p%201");
    expect(init.body).toBe(JSON.stringify({ status: "cancelled" }));

    const refused = vi.fn(async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    expect(await cancelPreapprovalAtMp("p1", "tok", refused)).toBe(false);
    const down = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await cancelPreapprovalAtMp("p1", "tok", down)).toBe(false);
  });

  it("uses the global fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await cancelPreapprovalAtMp("p1", "tok")).toBe(true);
    spy.mockRestore();
  });
});
