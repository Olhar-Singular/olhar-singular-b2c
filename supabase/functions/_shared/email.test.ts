import { describe, it, expect, vi, afterEach } from "vitest";
import { DEFAULT_EMAIL_FROM, EMAIL_TIMEOUT_MS, RESEND_EMAILS_URL, readEmailConfig, sendEmail, type EmailDeps, type EmailMessage } from "./email";

const CONFIG = { apiKey: "re_test_key", from: "Olhar Singular <contato@olharsingular.com>" };

function message(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: "ana@example.com",
    subject: "Sua assinatura está confirmada",
    html: "<p>Olá, Ana. Conteúdo secreto do corpo.</p>",
    text: "Olá, Ana. Conteúdo secreto do corpo.",
    tags: [{ name: "type", value: "subscription_confirmation" }],
    ...overrides,
  };
}

function deps(fetchFn: unknown, overrides: Partial<EmailDeps> = {}) {
  const d = { fetch: fetchFn as typeof fetch, config: CONFIG, log: vi.fn(), info: vi.fn(), ...overrides };
  return d as EmailDeps & { log: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
}

const calls = (fetchFn: unknown) => (fetchFn as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];

afterEach(() => {
  vi.useRealTimers();
});

describe("readEmailConfig", () => {
  const env = (vars: Record<string, string>) => ({ get: (n: string) => vars[n] });

  it("reads the key and the sender", () => {
    expect(readEmailConfig(env({ RESEND_API_KEY: "re_1", EMAIL_FROM: "Equipe <oi@x.com>" }))).toEqual({ apiKey: "re_1", from: "Equipe <oi@x.com>" });
  });

  it("falls back to the default sender when EMAIL_FROM is missing or blank", () => {
    expect(readEmailConfig(env({ RESEND_API_KEY: "re_1" }))).toEqual({ apiKey: "re_1", from: DEFAULT_EMAIL_FROM });
    expect(readEmailConfig(env({ RESEND_API_KEY: "re_1", EMAIL_FROM: "  " }))).toEqual({ apiKey: "re_1", from: DEFAULT_EMAIL_FROM });
    expect(DEFAULT_EMAIL_FROM).toBe("Olhar Singular <contato@olharsingular.com>");
  });

  it("is null without RESEND_API_KEY (missing or blank)", () => {
    expect(readEmailConfig(env({}))).toBeNull();
    expect(readEmailConfig(env({ RESEND_API_KEY: "", EMAIL_FROM: "x" }))).toBeNull();
    expect(readEmailConfig(env({ RESEND_API_KEY: "   " }))).toBeNull();
  });
});

describe("sendEmail", () => {
  it("posts the message to Resend with the bearer key and returns the id", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const d = deps(fetchFn);

    const result = await sendEmail(d, message());

    expect(result).toEqual({ ok: true, id: "msg_1" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      from: CONFIG.from,
      to: ["ana@example.com"],
      subject: "Sua assinatura está confirmada",
      html: "<p>Olá, Ana. Conteúdo secreto do corpo.</p>",
      text: "Olá, Ana. Conteúdo secreto do corpo.",
      tags: [{ name: "type", value: "subscription_confirmation" }],
    });
  });

  it("reports success through info (not the warning log) with only the subject, the HTTP status and the id", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const d = deps(fetchFn);
    await sendEmail(d, message());

    expect(d.log).not.toHaveBeenCalled();
    expect(d.info).toHaveBeenCalledTimes(1);
    expect(d.info).toHaveBeenCalledWith("email: sent", "Sua assinatura está confirmada", 200, "msg_1");
    const logged = JSON.stringify(d.info.mock.calls);
    expect(logged).not.toContain("ana@example.com");
    expect(logged).not.toContain("secreto");
  });

  it("falls back to console.log for the success line when the caller injects no info logger", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const d = deps(fetchFn, { info: undefined });
    await sendEmail(d, message());
    expect(info).toHaveBeenCalledWith("email: sent", "Sua assinatura está confirmada", 200, "msg_1");
    expect(d.log).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("omits tags from the body when the message has none, and tolerates a 2xx without id or with a non-JSON body", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 202 }));
    const result = await sendEmail(deps(fetchFn), message({ tags: undefined }));
    expect(result).toEqual({ ok: true, id: "" });
    expect(JSON.parse(calls(fetchFn)[0][1].body as string)).not.toHaveProperty("tags");

    const textBody = vi.fn(async () => new Response("Accepted", { status: 200 }));
    const d = deps(textBody);
    await expect(sendEmail(d, message())).resolves.toEqual({ ok: true, id: "" });
    expect(d.info).toHaveBeenCalledWith("email: sent", "Sua assinatura está confirmada", 200, "");
    expect(d.log).not.toHaveBeenCalled();
  });

  it("reports a non-2xx answer by status without throwing", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ message: "invalid from" }), { status: 422 }));
    const d = deps(fetchFn);

    const result = await sendEmail(d, message());

    expect(result).toEqual({ ok: false, reason: "http_422" });
    expect(d.log).toHaveBeenCalledWith("email: endpoint answered", "Sua assinatura está confirmada", 422);
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("ana@example.com");
  });

  it("reports a fetch exception as network_error without throwing", async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const d = deps(fetchFn);

    await expect(sendEmail(d, message())).resolves.toEqual({ ok: false, reason: "network_error" });
    expect(d.log).toHaveBeenCalledWith("email: send failed", "Sua assinatura está confirmada", "network_error", "fetch failed");

    const throwingValue = vi.fn(async () => { throw "weird"; });
    await expect(sendEmail(deps(throwingValue), message())).resolves.toEqual({ ok: false, reason: "network_error" });
  });

  it("gives up after the timeout and reports it", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    );
    const d = deps(hanging);

    const pending = sendEmail(d, message());
    await vi.advanceTimersByTimeAsync(EMAIL_TIMEOUT_MS - 1);
    expect(hanging.mock.calls[0][1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(EMAIL_TIMEOUT_MS).toBe(5000);
    // jsdom's DOMException is not a Node Error: either way the text, not the object, is logged.
    expect(d.log).toHaveBeenCalledWith("email: send failed", "Sua assinatura está confirmada", "timeout", expect.stringMatching(/aborted/));
  });

  it("without config does not call the API, answers not_configured and logs once", async () => {
    const fetchFn = vi.fn();
    const d = deps(fetchFn, { config: null });

    const result = await sendEmail(d, message());

    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenCalledWith("email: not configured (RESEND_API_KEY), skipping", "Sua assinatura está confirmada");
  });
});
