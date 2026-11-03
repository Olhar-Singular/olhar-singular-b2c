import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  // Achado 0280: para .docx, `pageImages` são as figuras embutidas do Word, não
  // páginas. O diálogo mostrava "Nenhuma página disponível" num Word só com
  // texto e rotulava cada figura como "Página N".
  describe("Word (.docx)", () => {
    it("shows the extracted text of the file when it has no embedded figures", () => {
      setup({ fileType: "docx", text: "1) Quanto é 2 + 2?\nA) 3\nB) 4", pageImages: [] });
      expect(screen.queryByText(/Nenhuma página disponível/i)).not.toBeInTheDocument();
      const body = screen.getByTestId("original-exam-text");
      expect(body.textContent).toBe("1) Quanto é 2 + 2?\nA) 3\nB) 4");
      expect(body).toHaveClass("whitespace-pre-wrap");
    });

    it("labels embedded figures as 'Figura N', never 'Página N'", () => {
      setup({ fileType: "docx", text: "Texto", pageImages: ["data:image/png;base64,F1", "data:image/png;base64,F2"] });
      expect(screen.getByTestId("original-exam-text")).toHaveTextContent("Texto");
      const images = screen.getAllByRole("img");
      expect(images).toHaveLength(2);
      expect(images[0]).toHaveAttribute("alt", "Figura 1 da prova original");
      expect(screen.getByText("Figura 1")).toBeInTheDocument();
      expect(screen.getByText("Figura 2")).toBeInTheDocument();
      expect(screen.queryByText(/Página \d/)).not.toBeInTheDocument();
    });

    it("falls back to a message when the file has neither text nor figures", () => {
      setup({ fileType: "docx", text: "   ", pageImages: [] });
      expect(screen.getByText(/Nenhum conteúdo disponível/i)).toBeInTheDocument();
      expect(screen.queryByTestId("original-exam-text")).not.toBeInTheDocument();
    });

    it("treats a missing text as empty", () => {
      setup({ fileType: "docx", pageImages: [] });
      expect(screen.getByText(/Nenhum conteúdo disponível/i)).toBeInTheDocument();
    });
  });
});

/**
 * 0281: diálogo controlado sem `DialogTrigger` larga o foco no `<body>` ao fechar.
 * O gatilho chega por `restoreFocusRef` e é devolvido no `onCloseAutoFocus`
 * (mesmo padrão do MetadataDrawer, 0349).
 */
describe("OriginalExamDialog: devolução de foco ao gatilho (0281)", () => {
  function Harness({ withRef }: { withRef: boolean }) {
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <button ref={triggerRef} onClick={() => setOpen(true)}>
          Ver prova original
        </button>
        <OriginalExamDialog
          open={open}
          onOpenChange={setOpen}
          restoreFocusRef={withRef ? triggerRef : undefined}
          pageImages={[]}
        />
      </>
    );
  }

  it("devolve o foco ao gatilho ao fechar", async () => {
    render(<Harness withRef />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ver prova original" })),
    );
  });

  it("sem gatilho informado, deixa o Radix cuidar do foco", async () => {
    render(<Harness withRef={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Prova original")).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Ver prova original" }));
  });
});
