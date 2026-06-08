import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";
import { DocumentStyleControl } from "./DocumentStyleControl";

// Render the popover content inline so we can assert on the controls without
// Radix's portal/positioning.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let onApplyToAll: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onApplyToAll = vi.fn();
});

describe("DocumentStyleControl", () => {
  it("renders the trigger button", () => {
    render(<DocumentStyleControl onApplyToAll={onApplyToAll} />);
    expect(screen.getByRole("button", { name: "Estilo do documento" })).toBeInTheDocument();
  });

  it("applies an empty style (nothing chosen) to all blocks", () => {
    render(<DocumentStyleControl onApplyToAll={onApplyToAll} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a tudo" }));
    expect(onApplyToAll).toHaveBeenCalledTimes(1);
    expect(onApplyToAll).toHaveBeenCalledWith({});
  });

  it("collects font/size/color/align and applies them to all blocks", () => {
    render(<DocumentStyleControl onApplyToAll={onApplyToAll} />);
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "serif" } });
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "#DC2626" } });
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "center" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a tudo" }));

    const style = onApplyToAll.mock.calls[0][0] as NodeStyle;
    expect(style).toEqual({
      fontFamily: "serif",
      fontSize: 22,
      color: "#DC2626",
      align: "center",
    });
  });

  it("omits a field that is cleared back to default", () => {
    render(<DocumentStyleControl onApplyToAll={onApplyToAll} />);
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "serif" } });
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a tudo" }));
    expect(onApplyToAll).toHaveBeenCalledWith({});
  });
});
