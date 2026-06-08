import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";
import { StyleControls } from "./StyleControls";

let onPatch: ReturnType<typeof vi.fn>;
let onToggleMark: ReturnType<typeof vi.fn>;
let onColorBlock: ReturnType<typeof vi.fn>;

function renderControls(style: NodeStyle = {}) {
  onPatch = vi.fn();
  onToggleMark = vi.fn();
  onColorBlock = vi.fn();
  render(
    <StyleControls
      style={style}
      onPatch={onPatch}
      onToggleMark={onToggleMark}
      onColorBlock={onColorBlock}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("StyleControls", () => {
  it("toggles bold and italic on the whole block", () => {
    renderControls();
    fireEvent.click(screen.getByLabelText("Negrito"));
    expect(onToggleMark).toHaveBeenCalledWith("bold");
    fireEvent.click(screen.getByLabelText("Itálico"));
    expect(onToggleMark).toHaveBeenCalledWith("italic");
  });

  it("emits a whole-block color and clears it (null) via Remover cor", () => {
    renderControls();
    fireEvent.change(screen.getByLabelText("Cor do texto"), { target: { value: "#DC2626" } });
    expect(onColorBlock).toHaveBeenCalledWith("#DC2626");
    fireEvent.change(screen.getByLabelText("Cor do texto"), { target: { value: "__none__" } });
    expect(onColorBlock).toHaveBeenCalledWith(null);
  });

  it("patches font to a token", () => {
    renderControls();
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "serif" } });
    expect(onPatch).toHaveBeenCalledWith({ fontFamily: "serif" });
  });

  it("clears font to undefined when set to default", () => {
    renderControls({ fontFamily: "serif" });
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "" } });
    expect(onPatch).toHaveBeenCalledWith({ fontFamily: undefined });
  });

  it("patches size to a number", () => {
    renderControls();
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "22" } });
    expect(onPatch).toHaveBeenCalledWith({ fontSize: 22 });
  });

  it("clears size to undefined when emptied", () => {
    renderControls({ fontSize: 22 });
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "" } });
    expect(onPatch).toHaveBeenCalledWith({ fontSize: undefined });
  });

  it("patches spacing to a number", () => {
    renderControls();
    fireEvent.change(screen.getByLabelText("Espaçamento (px)"), { target: { value: "8" } });
    expect(onPatch).toHaveBeenCalledWith({ spacingAfter: 8 });
  });

  it("clears spacing to undefined when emptied", () => {
    renderControls({ spacingAfter: 8 });
    fireEvent.change(screen.getByLabelText("Espaçamento (px)"), { target: { value: "" } });
    expect(onPatch).toHaveBeenCalledWith({ spacingAfter: undefined });
  });

  it("patches alignment to a value", () => {
    renderControls();
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "center" } });
    expect(onPatch).toHaveBeenCalledWith({ align: "center" });
  });

  it("clears alignment to undefined when set to default", () => {
    renderControls({ align: "center" });
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "" } });
    expect(onPatch).toHaveBeenCalledWith({ align: undefined });
  });

  it("patches the block color to a value", () => {
    renderControls();
    fireEvent.change(screen.getByLabelText("Cor do bloco"), { target: { value: "#2563EB" } });
    expect(onPatch).toHaveBeenCalledWith({ color: "#2563EB" });
  });

  it("clears the block color to undefined when set to default", () => {
    renderControls({ color: "#2563EB" });
    fireEvent.change(screen.getByLabelText("Cor do bloco"), { target: { value: "" } });
    expect(onPatch).toHaveBeenCalledWith({ color: undefined });
  });

  it("reflects an existing style in the control values", () => {
    renderControls({
      fontFamily: "mono",
      fontSize: 16,
      spacingAfter: 12,
      align: "right",
      color: "#16A34A",
    });
    expect(screen.getByLabelText("Fonte")).toHaveValue("mono");
    expect(screen.getByLabelText("Tamanho (px)")).toHaveValue(16);
    expect(screen.getByLabelText("Espaçamento (px)")).toHaveValue(12);
    expect(screen.getByLabelText("Alinhamento")).toHaveValue("right");
    expect(screen.getByLabelText("Cor do bloco")).toHaveValue("#16A34A");
  });
});
