import { describe, it, expect, beforeEach, vi } from "vitest";
import { gtagConsentDefault, gtagConsentUpdate, pushEvent, resetDataLayer } from "./dataLayer";
import { DENIED_ALL, GRANTED_ALL } from "./consent";

describe("dataLayer", () => {
  beforeEach(() => resetDataLayer());

  it("pushes events into window.dataLayer, creating it when absent", () => {
    delete window.dataLayer;
    pushEvent("view_item_list", { items: [] });
    expect(window.dataLayer).toEqual([{ event: "view_item_list", items: [] }]);
    pushEvent("select_item");
    expect(window.dataLayer).toHaveLength(2);
  });

  it("queues consent commands as gtag argument arrays before the container loads", () => {
    gtagConsentDefault(DENIED_ALL);
    gtagConsentUpdate(GRANTED_ALL);
    expect(window.dataLayer).toEqual([
      ["consent", "default", { ...DENIED_ALL, wait_for_update: 500 }],
      ["consent", "update", { ...GRANTED_ALL }],
    ]);
  });

  it("calls window.gtag directly once the container defined it", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    gtagConsentUpdate(GRANTED_ALL);
    expect(gtag).toHaveBeenCalledWith("consent", "update", { ...GRANTED_ALL });
    expect(window.dataLayer).toEqual([]);
  });
});
