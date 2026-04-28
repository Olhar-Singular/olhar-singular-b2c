import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ImagePreviewDialog from "./ImagePreviewDialog";

describe("ImagePreviewDialog", () => {
  it("does not render image when closed", () => {
    render(<ImagePreviewDialog open={false} onOpenChange={vi.fn()} imageUrl="https://x.png" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders image with default title alt text when open", () => {
    render(<ImagePreviewDialog open onOpenChange={vi.fn()} imageUrl="https://x.png" />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://x.png/");
    expect(img.alt).toBe("Prévia da imagem");
  });

  it("uses provided title for alt text", () => {
    render(<ImagePreviewDialog open onOpenChange={vi.fn()} imageUrl="https://x.png" title="custom" />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "custom");
  });

  it("renders no img element when imageUrl is null", () => {
    render(<ImagePreviewDialog open onOpenChange={vi.fn()} imageUrl={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
