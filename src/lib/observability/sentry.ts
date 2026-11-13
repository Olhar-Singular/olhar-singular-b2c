// Production error monitoring (Sentry, frontend). Decisions from the
// 2026-07-01 observability spec: no Session Replay (activities hold data about
// students with learning barriers, LGPD), users identified only by UUID, no
// automatic data collection (SDK v11 collects bodies, headers, cookies and IP
// by default; `dataCollection` turns all of it off). Tracing is sampled lightly in production.
//
// Trace headers are NOT propagated to any host (tracePropagationTargets: []):
// the Supabase edge functions' CORS allow-list doesn't include `sentry-trace`
// or `baggage`, so sending them would break every function call.

import * as Sentry from "@sentry/react";
import type { BrowserOptions, ErrorEvent } from "@sentry/react";

export interface SentryEnv {
  dsn?: string;
  mode: string;
  release?: string;
}

export function readSentryEnv(): SentryEnv {
  return {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    mode: import.meta.env.MODE,
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || undefined,
  };
}

/** Strips what can carry personal data: query strings, cookies and bodies. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (!request) return event;
  const { cookies: _cookies, data: _data, query_string: _query, ...rest } = request;
  if (rest.url) rest.url = rest.url.split("?")[0];
  return { ...event, request: rest };
}

export function buildSentryOptions(env: SentryEnv): BrowserOptions | null {
  const dsn = env.dsn?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: env.mode,
    release: env.release,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    },
    tracesSampleRate: env.mode === "production" ? 0.1 : 1,
    tracePropagationTargets: [],
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.httpClientIntegration({ failedRequestStatusCodes: [[500, 599]] }),
    ],
    beforeSend: scrubEvent,
  };
}

export function initSentry(env: SentryEnv = readSentryEnv()): boolean {
  const options = buildSentryOptions(env);
  if (!options) return false;
  Sentry.init(options);
  return true;
}

export function setSentryUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null);
}

export function captureError(error: unknown, componentStack?: string | null): void {
  Sentry.captureException(
    error,
    componentStack ? { contexts: { react: { componentStack } } } : undefined,
  );
}
