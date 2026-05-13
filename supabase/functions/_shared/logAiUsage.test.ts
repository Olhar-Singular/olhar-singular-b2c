import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  rpcMock.mockResolvedValue({ data: "school-1", error: null });
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { price_input_per_million: 0.1, price_output_per_million: 0.4 },
            error: null,
          }),
        }),
      }),
    }),
    insert: insertMock,
  });
  createClientMock.mockReturnValue({
    from: fromMock,
    rpc: rpcMock,
  });

  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (k: string) => (k === "SUPABASE_URL" ? "http://x" : "key") },
  } as unknown;
});

describe("logAiUsage", () => {
  it("inserts a usage row with API-provided tokens", async () => {
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
      input_tokens: 100,
      output_tokens: 200,
    });
    expect(insertMock).toHaveBeenCalled();
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.user_id).toBe("u1");
    expect(inserted.input_tokens).toBe(100);
    expect(inserted.output_tokens).toBe(200);
    expect(inserted.tokens_source).toBe("api");
  });

  it("estimates tokens from prompt_text and response_text when API tokens are 0", async () => {
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "adapt",
      model: "google/gemini-2.5-pro",
      prompt_text: "x".repeat(700),
      response_text: "y".repeat(350),
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.tokens_source).toBe("estimated");
    expect(inserted.input_tokens).toBeGreaterThan(0);
    expect(inserted.output_tokens).toBeGreaterThan(0);
  });

  it("marks tokens_source 'unknown' when no tokens and no text provided", async () => {
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "extract",
      model: "google/gemini-2.5-flash",
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.tokens_source).toBe("unknown");
  });

  it("uses fallback pricing when DB lookup throws", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.reject(new Error("db down")),
          }),
        }),
      }),
      insert: insertMock,
    });
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.cost_input).toBeGreaterThan(0);
    expect(inserted.cost_output).toBeGreaterThan(0);
  });

  it("preserves explicit school_id without calling rpc", async () => {
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      school_id: "explicit-school",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(insertMock.mock.calls[0][0].school_id).toBe("explicit-school");
  });

  it("resolves school_id from rpc when not provided", async () => {
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
    });
    expect(rpcMock).toHaveBeenCalledWith("get_user_school_id", { _user_id: "u1" });
    expect(insertMock.mock.calls[0][0].school_id).toBe("school-1");
  });

  it("warns and falls back to null school_id when rpc fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc-fail" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
    });
    expect(warn).toHaveBeenCalled();
    expect(insertMock.mock.calls[0][0].school_id).toBeNull();
    warn.mockRestore();
  });

  it("logs error to console when overall flow throws", async () => {
    createClientMock.mockImplementation(() => {
      throw new Error("init failed");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
    });
    expect(err).toHaveBeenCalledWith("Failed to log AI usage:", expect.anything());
    err.mockRestore();
  });

  it("estimates output_tokens based on response_text when only input_tokens provided as 0", async () => {
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
      input_tokens: 0,
      output_tokens: 0,
      prompt_text: "abc",
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.tokens_source).toBe("estimated");
    expect(inserted.input_tokens).toBeGreaterThan(0);
  });

  it("estimates input_tokens from prompt_text when input is 0 but output_tokens > 0 (lines 91-92)", async () => {
    // else-if branch: inputTokens === 0 AND outputTokens > 0 AND prompt_text present
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
      input_tokens: 0,
      output_tokens: 500,
      prompt_text: "x".repeat(400),
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.tokens_source).toBe("estimated");
    expect(inserted.input_tokens).toBeGreaterThan(0);
    expect(inserted.output_tokens).toBe(500);
  });

  it("estimates only output_tokens when only response_text provided and no prompt_text (line 84 false branch)", async () => {
    // inputTokens===0, outputTokens===0, log.response_text present but log.prompt_text absent
    // => if(log.prompt_text) is false, only if(log.response_text) runs
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
      response_text: "r".repeat(350),
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.tokens_source).toBe("estimated");
    expect(inserted.input_tokens).toBe(0);
    expect(inserted.output_tokens).toBeGreaterThan(0);
  });

  it("uses hardcoded fallback pricing when DB returns null data (lines 37-54 data===null branch)", async () => {
    // getModelPricing: data is null => if(data) is false => falls through to FALLBACK
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      insert: insertMock,
    });
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "google/gemini-2.5-flash",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    const inserted = insertMock.mock.calls[0][0];
    // falls back to hardcoded pricing for gemini-2.5-flash
    expect(inserted.cost_input).toBeCloseTo(0.075);
    expect(inserted.cost_output).toBeCloseTo(0.30);
  });

  it("uses zero pricing for unknown model not in FALLBACK (line 54 false branch)", async () => {
    // FALLBACK[model] is undefined => uses { input: 0, output: 0 }
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      insert: insertMock,
    });
    const { logAiUsage } = await import("./logAiUsage");
    await logAiUsage({
      user_id: "u1",
      action_type: "chat",
      model: "unknown/model-xyz",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.cost_input).toBe(0);
    expect(inserted.cost_output).toBe(0);
  });
});
