import { beforeEach, describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL, requestConsentReopen, resetConsentSession, storeConsent } from "./consent";
import { useConsentDecided } from "./useConsentDecided";

describe("useConsentDecided", () => {
  beforeEach(() => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    resetConsentSession();
  });

  it("is false while the visitor has not decided and flips to true when they do", () => {
    const { result } = renderHook(() => useConsentDecided());
    expect(result.current).toBe(false);
    act(() => storeConsent(window.localStorage, GRANTED_ALL));
    expect(result.current).toBe(true);
  });

  it("is true from the first render when an earlier visit stored a decision", () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_VERSION, consent: DENIED_ALL, decidedAt: "2026-10-01T00:00:00.000Z" }),
    );
    const { result } = renderHook(() => useConsentDecided());
    expect(result.current).toBe(true);
  });

  it("flips back to false while the banner is reopened and to true after the new decision", () => {
    storeConsent(window.localStorage, GRANTED_ALL);
    const { result } = renderHook(() => useConsentDecided());
    expect(result.current).toBe(true);
    act(() => requestConsentReopen());
    expect(result.current).toBe(false);
    act(() => storeConsent(window.localStorage, DENIED_ALL));
    expect(result.current).toBe(true);
  });

  it("stops listening to reopen requests after unmount", () => {
    const { result, unmount } = renderHook(() => useConsentDecided());
    expect(result.current).toBe(false);
    unmount();
    expect(() => act(() => requestConsentReopen())).not.toThrow();
  });
});
