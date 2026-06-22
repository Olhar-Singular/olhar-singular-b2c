import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeMirror, readMirror, clearMirror, type MirrorEntry } from "./draftMirror";
import { validResult } from "./__fixtures__/result";

// jsdom has no IndexedDB, so by default the module uses the localStorage path.
// We separately inject a fake IndexedDB to cover the preferred backend.

describe("draftMirror — localStorage fallback (no IndexedDB)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Ensure the IndexedDB feature-detect returns false.
    vi.stubGlobal("indexedDB", undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes and reads a mirror entry", async () => {
    await writeMirror("d1", validResult);
    const entry = await readMirror("d1");
    expect(entry?.draftId).toBe("d1");
    expect(entry?.result).toEqual(validResult);
    expect(typeof entry?.savedAt).toBe("number");
  });

  it("returns null when no mirror exists", async () => {
    expect(await readMirror("missing")).toBeNull();
  });

  it("returns null when the stored blob is corrupt", async () => {
    localStorage.setItem(
      "adaptation-draft:bad",
      JSON.stringify({ draftId: "bad", result: { junk: 1 }, savedAt: 1 }),
    );
    expect(await readMirror("bad")).toBeNull();
  });

  it("clears a mirror entry", async () => {
    await writeMirror("d2", validResult);
    await clearMirror("d2");
    expect(await readMirror("d2")).toBeNull();
  });

  it("swallows write errors (best-effort)", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await expect(writeMirror("d3", validResult)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("returns null when read throws", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("read-fail");
    });
    expect(await readMirror("d4")).toBeNull();
    spy.mockRestore();
  });

  it("swallows clear errors (best-effort)", async () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("rm-fail");
    });
    await expect(clearMirror("d5")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// IndexedDB backend — minimal in-memory fake.
// ---------------------------------------------------------------------------

type FakeStore = Map<string, MirrorEntry>;

function makeFakeIndexedDb(store: FakeStore, opts: { failTx?: boolean } = {}) {
  function makeTx() {
    const handlers: Record<string, () => void> = {};
    const objectStore = {
      put: (entry: MirrorEntry) => {
        if (!opts.failTx) store.set(entry.draftId, entry);
      },
      get: (key: string) => {
        const req: Record<string, unknown> = { result: store.get(key) };
        queueMicrotask(() => (req.onsuccess as () => void)?.());
        return req;
      },
      delete: (key: string) => {
        store.delete(key);
      },
    };
    const tx = {
      objectStore: () => objectStore,
      set oncomplete(fn: () => void) {
        handlers.complete = fn;
        if (!opts.failTx) queueMicrotask(fn);
      },
      set onerror(fn: () => void) {
        if (opts.failTx) queueMicrotask(fn);
      },
      error: opts.failTx ? new Error("tx-fail") : null,
    };
    return tx;
  }
  return {
    open: () => {
      const req: Record<string, unknown> = { result: null };
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: vi.fn(),
        transaction: () => makeTx(),
        close: vi.fn(),
      };
      req.result = db;
      queueMicrotask(() => {
        (req.onupgradeneeded as () => void)?.();
        (req.onsuccess as () => void)?.();
      });
      return req;
    },
  };
}

describe("draftMirror — IndexedDB backend", () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("indexedDB", makeFakeIndexedDb(store));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes, reads, and clears via IndexedDB", async () => {
    await writeMirror("idb1", validResult);
    expect(store.has("idb1")).toBe(true);
    const entry = await readMirror("idb1");
    expect(entry?.result).toEqual(validResult);
    await clearMirror("idb1");
    expect(store.has("idb1")).toBe(false);
  });

  it("returns null when the IndexedDB entry is absent", async () => {
    expect(await readMirror("nope")).toBeNull();
  });

  it("falls back to localStorage when an IndexedDB write transaction fails", async () => {
    vi.stubGlobal("indexedDB", makeFakeIndexedDb(store, { failTx: true }));
    await writeMirror("idb2", validResult);
    // IDB tx failed → fell back to localStorage.
    const entry = await readMirror("idb2");
    // readMirror uses IDB (which has no row) → null; verify the LS fallback row exists.
    expect(entry).toBeNull();
    expect(localStorage.getItem("adaptation-draft:idb2")).not.toBeNull();
  });

  it("treats a present-but-null indexedDB as unavailable (localStorage path)", async () => {
    vi.stubGlobal("indexedDB", null);
    await writeMirror("nullidb", validResult);
    expect(localStorage.getItem("adaptation-draft:nullidb")).not.toBeNull();
  });

  it("returns null when opening the database errors", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: Record<string, unknown> = { error: new Error("open-fail") };
        queueMicrotask(() => (req.onerror as () => void)?.());
        return req;
      },
    });
    expect(await readMirror("x")).toBeNull();
  });

  it("returns null when the get request errors", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: Record<string, unknown> = {};
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: vi.fn(),
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const r: Record<string, unknown> = { error: new Error("get-fail") };
                queueMicrotask(() => (r.onerror as () => void)?.());
                return r;
              },
            }),
          }),
          close: vi.fn(),
        };
        req.result = db;
        queueMicrotask(() => {
          // store already exists → contains() === true skips createObjectStore
          (req.onupgradeneeded as () => void)?.();
          (req.onsuccess as () => void)?.();
        });
        return req;
      },
    });
    expect(await readMirror("y")).toBeNull();
  });

  it("swallows a failing IndexedDB delete (best-effort)", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: Record<string, unknown> = {};
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: vi.fn(),
          transaction: () => ({
            objectStore: () => ({ delete: vi.fn() }),
            set oncomplete(_fn: () => void) {
              /* never completes */
            },
            set onerror(fn: () => void) {
              queueMicrotask(fn);
            },
            error: new Error("del-fail"),
          }),
          close: vi.fn(),
        };
        req.result = db;
        queueMicrotask(() => (req.onsuccess as () => void)?.());
        return req;
      },
    });
    await expect(clearMirror("z")).resolves.toBeUndefined();
  });
});
