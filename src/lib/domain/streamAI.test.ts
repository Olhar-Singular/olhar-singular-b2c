import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }),
    },
  },
}));

import { streamAI } from "./streamAI";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function sseStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function delta(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

describe("streamAI", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("streams content deltas and calls onDone at [DONE] sentinel", async () => {
    fetchMock.mockResolvedValue(sseStream([delta("Hello "), delta("world"), "data: [DONE]\n"]));

    const onDelta = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamAI({
      endpoint: "chat",
      body: { x: 1 },
      onDelta,
      onDone,
      onError,
    });

    expect(onDelta).toHaveBeenCalledWith("Hello ");
    expect(onDelta).toHaveBeenCalledWith("world");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError with body.error message when response is non-OK", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "limite atingido" }), { status: 429 }),
    );

    const onError = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith("limite atingido");
  });

  it("calls onError with status code when JSON body has no error field", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ unrelated: "x" }), { status: 500 }),
    );
    const onError = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith("Erro 500");
  });

  it("falls back to 'Erro de conexão' when error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", { status: 502 }));
    const onError = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith("Erro de conexão");
  });

  it("calls onError when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network gone"));
    const onError = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith("network gone");
  });

  it("ignores comment lines and empty SSE lines", async () => {
    fetchMock.mockResolvedValue(
      sseStream([": keepalive\n\n", delta("only"), "data: [DONE]\n"]),
    );
    const onDelta = vi.fn();
    const onDone = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone,
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith("only");
    expect(onDone).toHaveBeenCalled();
  });

  it("handles delta split across two read chunks", async () => {
    const full = delta("split-content");
    const cut = full.length - 5;
    const part1 = full.slice(0, cut);
    const part2 = full.slice(cut) + "data: [DONE]\n";
    fetchMock.mockResolvedValue(sseStream([part1, part2]));

    const onDelta = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("split-content");
  });

  it("calls onError when response has no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const onError = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith("Sem resposta do servidor");
  });

  it("sends Authorization header with the active session token", async () => {
    fetchMock.mockResolvedValue(sseStream([delta("x"), "data: [DONE]\n"]));
    await streamAI({
      endpoint: "chat",
      body: { foo: "bar" },
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("processes a residual delta line in the trailing buffer (no [DONE] sentinel)", async () => {
    const last = `data: ${JSON.stringify({ choices: [{ delta: { content: "tail" } }] })}`;
    fetchMock.mockResolvedValue(sseStream([last]));
    const onDelta = vi.fn();
    const onDone = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone,
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("tail");
    expect(onDone).toHaveBeenCalled();
  });

  it("ignores trailing buffer comment lines, blanks, non-data lines and [DONE]", async () => {
    const trailing = ": comment\nignored line\ndata: [DONE]";
    fetchMock.mockResolvedValue(sseStream([trailing]));
    const onDelta = vi.fn();
    const onDone = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone,
      onError: vi.fn(),
    });
    expect(onDelta).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("strips \\r from trailing buffer lines before processing", async () => {
    const last = `data: ${JSON.stringify({ choices: [{ delta: { content: "crlf" } }] })}\r`;
    fetchMock.mockResolvedValue(sseStream([last]));
    const onDelta = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("crlf");
  });

  it("ignores invalid JSON in trailing buffer without throwing", async () => {
    const last = "data: {not-json";
    fetchMock.mockResolvedValue(sseStream([last]));
    const onError = vi.fn();
    const onDone = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone,
      onError,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("falls back to publishable key when no session", async () => {
    const supa = await import("@/integrations/supabase/client");
    vi.mocked(supa.supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as never);
    fetchMock.mockResolvedValue(sseStream(["data: [DONE]\n"]));
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization.startsWith("Bearer ")).toBe(true);
  });

  it("re-parks an incomplete JSON delta back into the buffer for next chunk", async () => {
    const head = `data: {"choices":[{"delta":{"content":"`;
    const tail = `partial"}}]}\ndata: [DONE]\n`;
    fetchMock.mockResolvedValue(sseStream([head, tail]));
    const onDelta = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("partial");
  });

  it("strips \\r from lines in the main SSE loop (line 58 branch)", async () => {
    // A \r-terminated line *with* a newline separator triggers the line 58 strip in the main loop
    const content = JSON.stringify({ choices: [{ delta: { content: "crlf-main" } }] });
    const chunk = `data: ${content}\r\ndata: [DONE]\n`;
    fetchMock.mockResolvedValue(sseStream([chunk]));
    const onDelta = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("crlf-main");
  });

  it("ignores whitespace-only lines in trailing buffer (lines 83-84 raw.trim()==='' branch)", async () => {
    // trailing buffer line that is spaces-only: raw is not "" but raw.trim() === ""
    const content = JSON.stringify({ choices: [{ delta: { content: "after-space" } }] });
    // "   " is a whitespace line, then valid delta, all without a terminating newline so they end in buffer
    const trailing = `   \ndata: ${content}`;
    fetchMock.mockResolvedValue(sseStream([trailing]));
    const onDelta = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("after-space");
  });

  it("calls onError with 'Erro desconhecido' when a non-Error value is thrown (line 97 false branch)", async () => {
    // Throwing a non-Error (e.g., a string) hits the `e instanceof Error` false branch
    fetchMock.mockImplementation(() => { throw "string error"; });
    const onError = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith("Erro desconhecido");
  });

  it("re-parks malformed JSON line in main loop and recovers from next chunk (lines 73-74)", async () => {
    // A complete line with bad JSON triggers the catch; the line is re-parked into
    // textBuffer and on the next read it gets a valid continuation appended.
    // Simplest: bad JSON line followed by another read containing its fix and [DONE].
    const bad = `data: {broken\n`;
    const fix = `data: ${JSON.stringify({ choices: [{ delta: { content: "recovered" } }] })}\ndata: [DONE]\n`;
    fetchMock.mockResolvedValue(sseStream([bad, fix]));
    const onDelta = vi.fn();
    const onDone = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone,
      onError: vi.fn(),
    });
    // The bad line is re-parked; the next read re-processes it. Since re-parked line
    // still has bad JSON, it ends up in the trailing buffer and is silently ignored.
    // The valid line that follows is processed normally.
    expect(onDelta).toHaveBeenCalledWith("recovered");
    expect(onDone).toHaveBeenCalled();
  });

  it("skips non-data trailing text after a newline-terminated delta (line 85 true branch)", async () => {
    // Main loop processes the delta line (has \n), leaving "ignored text" in trailing buffer.
    // trailing buffer: "ignored text" does not start with "data: " -> hits line 85 true branch (continue)
    const content = JSON.stringify({ choices: [{ delta: { content: "main-delta" } }] });
    const chunk = `data: ${content}\nignored text`;
    fetchMock.mockResolvedValue(sseStream([chunk]));
    const onDelta = vi.fn();
    const onDone = vi.fn();
    await streamAI({
      endpoint: "chat",
      body: {},
      onDelta,
      onDone,
      onError: vi.fn(),
    });
    expect(onDelta).toHaveBeenCalledWith("main-delta");
    expect(onDone).toHaveBeenCalled();
  });
});
