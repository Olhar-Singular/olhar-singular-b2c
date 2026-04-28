import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import EditorToolbar from "./EditorToolbar";

function Wrapper(props: {
  onInsert?: (s: string) => void;
  onWrap?: (b: string, a: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onImageClick?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <textarea ref={ref} />
      <EditorToolbar
        textareaRef={ref}
        onInsert={props.onInsert ?? vi.fn()}
        onWrap={props.onWrap ?? vi.fn()}
        getNextQuestionNumber={() => 5}
        onUndo={props.onUndo ?? vi.fn()}
        onRedo={props.onRedo ?? vi.fn()}
        canUndo={props.canUndo ?? false}
        canRedo={props.canRedo ?? false}
        onImageClick={props.onImageClick}
      />
    </>
  );
}

describe("EditorToolbar", () => {
  it("renders the Inserir and Formato dropdown triggers", () => {
    render(<Wrapper />);
    expect(screen.getByText(/Inserir/i)).toBeInTheDocument();
    expect(screen.getByText(/Formato/i)).toBeInTheDocument();
  });

  it("opens the Inserir dropdown and inserts a section template", () => {
    const onInsert = vi.fn();
    render(<Wrapper onInsert={onInsert} />);
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText("Seção"));
    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("# Nova Seção"));
  });

  it("inserts a múltipla escolha template using getNextQuestionNumber", () => {
    const onInsert = vi.fn();
    render(<Wrapper onInsert={onInsert} />);
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/Múltipla escolha/i));
    expect(onInsert.mock.calls[0][0]).toContain("5)");
  });

  it("opens the Formato dropdown and triggers onWrap with bold markers", () => {
    const onWrap = vi.fn();
    render(<Wrapper onWrap={onWrap} />);
    fireEvent.click(screen.getByText(/Formato/i));
    fireEvent.click(screen.getByText(/Negrito/i));
    expect(onWrap).toHaveBeenCalledWith("**", "**");
  });

  it("undo button calls onUndo", () => {
    const onUndo = vi.fn();
    render(<Wrapper onUndo={onUndo} canUndo />);
    fireEvent.click(screen.getByTitle(/Desfazer/i));
    expect(onUndo).toHaveBeenCalled();
  });

  it("redo button calls onRedo", () => {
    const onRedo = vi.fn();
    render(<Wrapper onRedo={onRedo} canRedo />);
    fireEvent.click(screen.getByTitle(/Refazer/i));
    expect(onRedo).toHaveBeenCalled();
  });

  it("undo/redo buttons are disabled when canUndo/canRedo are false", () => {
    render(<Wrapper canUndo={false} canRedo={false} />);
    expect(screen.getByTitle(/Desfazer/i)).toBeDisabled();
    expect(screen.getByTitle(/Refazer/i)).toBeDisabled();
  });

  it("renders an image button when onImageClick is provided", () => {
    const onImageClick = vi.fn();
    render(<Wrapper onImageClick={onImageClick} />);
    const imgBtn = screen.getByTitle(/Imagens|Imagem/i);
    fireEvent.click(imgBtn);
    expect(onImageClick).toHaveBeenCalled();
  });

  it("closes the Inserir dropdown on outside click (mousedown on document)", () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByText(/Inserir/i));
    expect(screen.getByText("Seção")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Seção")).toBeNull();
  });

  it("Info button inserts an instruction template", () => {
    const onInsert = vi.fn();
    render(<Wrapper onInsert={onInsert} />);
    fireEvent.click(screen.getByTitle(/Inserir instrução/i));
    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("> Atenção"));
  });

  it("Sep button inserts a separator template", () => {
    const onInsert = vi.fn();
    render(<Wrapper onInsert={onInsert} />);
    fireEvent.click(screen.getByTitle(/Inserir separador/i));
    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("---"));
  });

  it("inserts each Insert dropdown template type", () => {
    const onInsert = vi.fn();
    render(<Wrapper onInsert={onInsert} />);
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/Multi-resposta/i));
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/Discursiva/i));
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/Lacuna/i));
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/V\/F/i));
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/Associação/i));
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/Ordenação/i));
    fireEvent.click(screen.getByText(/Inserir/i));
    fireEvent.click(screen.getByText(/^Tabela$/));
    expect(onInsert).toHaveBeenCalledTimes(7);
  });

  it("clicking each Format option dispatches onWrap with the right markers", () => {
    const onWrap = vi.fn();
    render(<Wrapper onWrap={onWrap} />);
    fireEvent.click(screen.getByText(/Formato/i));
    fireEvent.click(screen.getByText(/Itálico/i));
    expect(onWrap).toHaveBeenCalledWith("*", "*");
    fireEvent.click(screen.getByText(/Formato/i));
    fireEvent.click(screen.getByText(/Sublinhado/i));
    expect(onWrap).toHaveBeenCalledWith("__", "__");
    fireEvent.click(screen.getByText(/Formato/i));
    fireEvent.click(screen.getByText(/Tachado/i));
    expect(onWrap).toHaveBeenCalledWith("~~", "~~");
    fireEvent.click(screen.getByText(/Formato/i));
    fireEvent.click(screen.getByText(/Matemática/i));
    expect(onWrap).toHaveBeenCalledWith("$", "$");
  });
});
