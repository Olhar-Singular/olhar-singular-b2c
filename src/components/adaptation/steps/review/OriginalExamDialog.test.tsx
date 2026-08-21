import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OriginalExamDialog } from "./OriginalExamDialog";

function setup(over: Partial<React.ComponentProps<typeof OriginalExamDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <OriginalExamDialog open onOpenChange={onOpenChange} pageImages={["data:image/png;base64,PAGE1"]} {...over} />,
  );
  return { onOpenChange };
}

describe("OriginalExamDialog", () => {
  it("renders the title", () => {
    setup();
    expect(screen.getByText("Prova original")).toBeInTheDocument();
  });

  it("renders one image per page, labelled with its page number", () => {
    setup({ pageImages: ["data:image/png;base64,P1", "data:image/png;base64,P2"] });
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "data:image/png;base64,P1");
    expect(images[0]).toHaveAttribute("alt", "Página 1 da prova original");
    expect(images[1]).toHaveAttribute("src", "data:image/png;base64,P2");
    expect(screen.getByText("Página 1")).toBeInTheDocument();
    expect(screen.getByText("Página 2")).toBeInTheDocument();
  });

  it("shows a fallback message when there are no pages to compare", () => {
    setup({ pageImages: [] });
    expect(screen.getByText(/Nenhuma página disponível/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    setup({ open: false });
    expect(screen.queryByText("Prova original")).not.toBeInTheDocument();
  });
});
