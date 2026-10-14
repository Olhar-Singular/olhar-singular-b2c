// Fire-and-forget work that must never delay nor fail the HTTP answer (analytics
// hits, transactional e-mails). On the Supabase edge runtime the task is handed
// to EdgeRuntime.waitUntil, which keeps the worker alive after the response;
// anywhere else (tests, plain Deno) it is awaited so nothing is lost. A failing
// task is reported with a label only: no payload, no addressee.

export interface WaitUntilHost {
  EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
}

const LABEL = "background: task failed";

function guard(task: Promise<void>): Promise<void> {
  return task.catch((e: unknown) => {
    console.warn(LABEL, e instanceof Error ? e.name : typeof e);
  });
}

/** Runs `task` off the response path. Never throws, never rejects. */
export async function dispatchInBackground(task: Promise<void>, host: WaitUntilHost = globalThis as WaitUntilHost): Promise<void> {
  const guarded = guard(task);
  const waitUntil = host.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(guarded);
    return;
  }
  await guarded;
}
