import { describe, it, expect, vi, afterEach } from "vitest";
import { dispatchInBackground } from "./background";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dispatchInBackground", () => {
  it("hands the task to EdgeRuntime.waitUntil and returns without waiting for it", async () => {
    const waitUntil = vi.fn();
    let settled = false;
    const task = new Promise<void>((resolve) => setTimeout(() => { settled = true; resolve(); }, 20));

    await dispatchInBackground(task, { EdgeRuntime: { waitUntil } });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await task;
  });

  it("never hands waitUntil a promise that rejects: a failing task is warned with a label only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const waitUntil = vi.fn();

    await dispatchInBackground(Promise.reject(new Error("smtp down for ana@example.com")), { EdgeRuntime: { waitUntil } });
    const handed = waitUntil.mock.calls[0][0] as Promise<unknown>;
    await expect(handed).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("background: task failed");
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain("ana@example.com");
  });

  it("awaits the task outside the edge runtime", async () => {
    let settled = false;
    await dispatchInBackground(new Promise<void>((resolve) => setTimeout(() => { settled = true; resolve(); }, 0)), {});
    expect(settled).toBe(true);

    settled = false;
    await dispatchInBackground(new Promise<void>((resolve) => setTimeout(() => { settled = true; resolve(); }, 0)), { EdgeRuntime: {} });
    expect(settled).toBe(true);
  });

  it("never throws outside the edge runtime either", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(dispatchInBackground(Promise.reject(new Error("boom")), {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("background: task failed", "Error");

    await expect(dispatchInBackground(Promise.reject("weird"), {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("background: task failed", "string");
  });

  it("uses globalThis as the host by default", async () => {
    let settled = false;
    await dispatchInBackground(Promise.resolve().then(() => { settled = true; }));
    expect(settled).toBe(true);
  });
});
