import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ErrorEvent } from "@sentry/react";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  httpClientIntegration: vi.fn(() => ({ name: "HttpClient" })),
}));
vi.mock("@sentry/react", () => sentry);

import {
  buildSentryOptions,
  captureError,
  initSentry,
  readSentryEnv,
  scrubEvent,
  setSentryUser,
} from "./sentry";

const DSN = "https://key@o1.ingest.us.sentry.io/2";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("buildSentryOptions", () => {
  it("returns null without a DSN, so nothing is sent", () => {
    expect(buildSentryOptions({ dsn: "  ", mode: "production" })).toBeNull();
    expect(buildSentryOptions({ mode: "production" })).toBeNull();
  });

  it("turns off every automatic data collection (SDK v11 collects it all by default)", () => {
    const opts = buildSentryOptions({ dsn: DSN, mode: "production" });
    expect(opts?.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    });
  });

  it("samples 10% of traces in production and tags env/release", () => {
    const opts = buildSentryOptions({ dsn: DSN, mode: "production", release: "abc123" });
    expect(opts).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "abc123",
      tracesSampleRate: 0.1,
      tracePropagationTargets: [],
    });
  });

  it("samples every trace outside production", () => {
    const opts = buildSentryOptions({ dsn: DSN, mode: "development" });
    expect(opts?.tracesSampleRate).toBe(1);
    expect(opts?.release).toBeUndefined();
  });

  it("reports failed requests only for 5xx responses and never enables Session Replay", () => {
    const opts = buildSentryOptions({ dsn: DSN, mode: "production" });
    expect(sentry.httpClientIntegration).toHaveBeenCalledWith({ failedRequestStatusCodes: [[500, 599]] });
    expect(opts?.integrations).toEqual([{ name: "BrowserTracing" }, { name: "HttpClient" }]);
  });

  it("scrubs events before sending", () => {
    const opts = buildSentryOptions({ dsn: DSN, mode: "production" });
    expect(opts?.beforeSend).toBe(scrubEvent);
  });
});

describe("scrubEvent", () => {
  it("drops query strings, which can carry e-mails or filters, from the request", () => {
    const event = {
      request: { url: "https://x.supabase.co/rest/v1/profiles?email=eq.a@b.com", query_string: "email=eq.a@b.com" },
    } as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.url).toBe("https://x.supabase.co/rest/v1/profiles");
    expect(out.request?.query_string).toBeUndefined();
  });

  it("drops cookies and request bodies", () => {
    const event = { request: { url: "https://a/b", cookies: { c: "1" }, data: { text: "aluno" } } } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
  });

  it("passes events without a request through untouched", () => {
    const event = { message: "boom" } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({ message: "boom" });
  });

  it("keeps a request with no URL", () => {
    const event = { request: { method: "GET" } } as ErrorEvent;
    expect(scrubEvent(event).request).toEqual({ method: "GET" });
  });
});

describe("readSentryEnv", () => {
  it("reads DSN, mode and the Vercel commit SHA from the Vite env", () => {
    vi.stubEnv("VITE_SENTRY_DSN", DSN);
    vi.stubEnv("VITE_VERCEL_GIT_COMMIT_SHA", "sha1");
    expect(readSentryEnv()).toEqual({ dsn: DSN, mode: import.meta.env.MODE, release: "sha1" });
  });

  it("leaves release undefined when the SHA is empty", () => {
    vi.stubEnv("VITE_SENTRY_DSN", DSN);
    vi.stubEnv("VITE_VERCEL_GIT_COMMIT_SHA", "");
    expect(readSentryEnv().release).toBeUndefined();
  });
});

describe("initSentry", () => {
  it("initializes with the built options when a DSN exists", () => {
    expect(initSentry({ dsn: DSN, mode: "production" })).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN }));
  });

  it("does nothing without a DSN", () => {
    expect(initSentry({ mode: "production" })).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("defaults to the Vite env", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    expect(initSentry()).toBe(false);
  });
});

describe("setSentryUser", () => {
  it("identifies the user by id only", () => {
    setSentryUser("u-1");
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "u-1" });
  });

  it("clears the user on sign-out", () => {
    setSentryUser(null);
    expect(sentry.setUser).toHaveBeenCalledWith(null);
  });
});

describe("captureError", () => {
  it("forwards the error with the React component stack", () => {
    const err = new Error("x");
    captureError(err, "  at Foo");
    expect(sentry.captureException).toHaveBeenCalledWith(err, {
      contexts: { react: { componentStack: "  at Foo" } },
    });
  });

  it("forwards the error without context when there is no stack", () => {
    const err = new Error("y");
    captureError(err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, undefined);
  });
});
