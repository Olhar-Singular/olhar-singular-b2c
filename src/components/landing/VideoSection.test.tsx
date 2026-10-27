import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import VideoSection from "./VideoSection";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/landing/video-mito.webp", () => ({ default: "stub://video-mito.webp" }));
vi.mock("@/assets/landing/video-depoimento.webp", () => ({ default: "stub://video-depoimento.webp" }));

function videos(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll("video"));
}

describe("VideoSection", () => {
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.dataLayer = [];
    // jsdom does not implement media playback; the section only needs the calls.
    pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    pause.mockRestore();
  });

  it("is a region labelled by its h2 heading", () => {
    renderWithProviders(<VideoSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Veja em vídeo" });
    const region = screen.getByRole("region", { name: "Veja em vídeo" });
    expect(region).toContainElement(heading);
    expect(region).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading).toHaveAttribute("id", "h-videos");
  });

  it("lists two vertical videos served from the public landing bucket, with an accessible name and no text around them", () => {
    const { container } = renderWithProviders(<VideoSection />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const seen = videos();
    expect(seen).toHaveLength(2);
    items.forEach((item, i) => {
      const video = item.querySelector("video")!;
      expect(seen[i]).toBe(video);
      expect((video.getAttribute("aria-label") ?? "").length).toBeGreaterThan(10);
      expect(video.getAttribute("src")).toMatch(/^http:\/\/localhost:54321\/storage\/v1\/object\/public\/landing\/videos\/[a-z-]+\.mp4$/);
      expect(item.textContent?.trim()).toBe("");
    });
    expect(container.querySelector("figure, figcaption")).toBeNull();
    expect(videos().map((v) => v.getAttribute("src"))).toEqual([
      "http://localhost:54321/storage/v1/object/public/landing/videos/depoimento.mp4",
      "http://localhost:54321/storage/v1/object/public/landing/videos/mito.mp4",
    ]);
  });

  it("is click-to-play: native controls, nothing preloaded, a poster, inline playback and fixed dimensions", () => {
    renderWithProviders(<VideoSection />);
    videos().forEach((video) => {
      expect(video).toHaveAttribute("controls");
      expect(video).toHaveAttribute("preload", "none");
      expect(video).toHaveAttribute("playsinline");
      expect(video.getAttribute("poster")).toMatch(/^stub:\/\/video-[a-z]+\.webp$/);
      expect(video).toHaveAttribute("width", "720");
      expect(video).toHaveAttribute("height", "1280");
      expect(video).not.toHaveAttribute("autoplay");
    });
  });

  it("shows no text besides the heading: the videos speak for themselves", () => {
    const { container } = renderWithProviders(<VideoSection />);
    expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe("Veja em vídeo");
  });

  it("pushes video_play once per video, on the first play only", () => {
    renderWithProviders(<VideoSection />);
    const [first, second] = videos();
    fireEvent.play(first);
    fireEvent.play(first);
    fireEvent.play(second);
    const events = (window.dataLayer ?? []).filter((e) => (e as { event?: string }).event === "video_play");
    expect(events).toEqual([
      { event: "video_play", video: "depoimento" },
      { event: "video_play", video: "mito" },
    ]);
  });

  it("pauses the other video when one starts playing", () => {
    renderWithProviders(<VideoSection />);
    const [first, second] = videos();
    fireEvent.play(first);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(pause.mock.instances[0]).toBe(second);
    fireEvent.play(second);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(pause.mock.instances[1]).toBe(first);
  });

  it("has no template tokens, dashes or inline styles", () => {
    const { container } = renderWithProviders(<VideoSection />);
    const text = `${container.textContent ?? ""}\n${container.innerHTML}`;
    expect(text).not.toContain("{{");
    const dashes = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);
    expect(container.textContent ?? "").not.toMatch(dashes);
    expect(container.innerHTML).not.toMatch(dashes);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
