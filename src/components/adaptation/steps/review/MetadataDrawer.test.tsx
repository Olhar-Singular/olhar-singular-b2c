import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MetadataDrawer } from "./MetadataDrawer";

const META = {
  strategies: ["Linguagem Direta e Objetiva", "Suporte Visual (DUA)"],
  tips: ["Leia o enunciado em voz alta.", "Disponibilize folha de rascunho."],
  justification: "A adaptação mitiga a barreira da abstração sem reduzir o rigor cognitivo.",
};

function setup(over: Partial<React.ComponentProps<typeof MetadataDrawer>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <MetadataDrawer
      open
      onOpenChange={onOpenChange}
      strategies={META.strategies}
      tips={META.tips}
      justification={META.justification}
      {...over}
    />,
  );
  return { onOpenChange };
}

describe("MetadataDrawer", () => {
  it("renderiza o título da gaveta", () => {
    setup();
    expect(screen.getByText("Sobre esta adaptação")).toBeInTheDocument();
  });

  it("renderiza as estratégias aplicadas como tags", () => {
    setup();
    expect(screen.getByText("Estratégias aplicadas")).toBeInTheDocument();
    for (const s of META.strategies) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });

  it("renderiza as dicas de aplicação como lista numerada", () => {
    setup();
    expect(screen.getByText("Dicas de aplicação")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(META.tips.length);
    for (const t of META.tips) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("renderiza a justificativa pedagógica", () => {
    setup();
    expect(screen.getByText("Justificativa pedagógica")).toBeInTheDocument();
    expect(screen.getByText(META.justification)).toBeInTheDocument();
  });

  it("expõe uma descrição acessível no diálogo (aria-describedby)", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy as string);
    expect(description).not.toBeNull();
    expect(description?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("não renderiza o conteúdo quando fechada", () => {
    setup({ open: false });
    expect(screen.queryByText("Sobre esta adaptação")).not.toBeInTheDocument();
  });

  it("propaga o fechamento via onOpenChange (botão fechar do Sheet)", () => {
    const { onOpenChange } = setup();
    // O Sheet (shadcn) injeta um botão de fechar com rótulo sr-only "Close".
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

/**
 * 0349 — gaveta controlada não tem `SheetTrigger`, então o Radix restaura o foco
 * no `previouslyFocusedElement` (que pode ser o `<body>`). O gatilho é entregue
 * por `restoreFocusRef` e devolvido no `onCloseAutoFocus`.
 */
describe("MetadataDrawer — devolução de foco ao gatilho (0349)", () => {
  function Harness({ withRef }: { withRef: boolean }) {
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <button ref={triggerRef} onClick={() => setOpen(true)}>
          Sobre
        </button>
        <MetadataDrawer
          open={open}
          onOpenChange={setOpen}
          restoreFocusRef={withRef ? triggerRef : undefined}
          strategies={META.strategies}
          tips={META.tips}
          justification={META.justification}
        />
      </>
    );
  }

  it("devolve o foco ao gatilho ao fechar", async () => {
    render(<Harness withRef />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sobre" })),
    );
  });

  it("sem gatilho informado, deixa o Radix cuidar do foco", async () => {
    render(<Harness withRef={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Dicas de aplicação")).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Sobre" }));
  });
});

/**
 * 0367 — o botão de fechar vem do `SheetContent` (shadcn, arquivo protegido) sem
 * padding nem tamanho: a caixa era a do ícone, 16 x 16, abaixo dos 24 x 24 CSS px
 * do WCAG 2.2 SC 2.5.8 (AA). A gaveta cresce o alvo de quem consome.
 */
describe("MetadataDrawer — alvo de toque do botão de fechar (0367)", () => {
  it("cresce o botão injetado pelo Sheet até o piso de 24 x 24", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Close" });
    // o alvo alcançado pelas utilitárias `[&>button]:*` é filho DIRETO do content
    expect(close.parentElement).toBe(dialog);
    for (const cls of [
      "[&>button]:min-h-[24px]",
      "[&>button]:min-w-[24px]",
      "[&>button]:p-1",
      "[&>button]:-m-1",
    ]) {
      expect(dialog).toHaveClass(cls);
    }
  });
});

/**
 * 0266 — a gaveta é "somente leitura", mas a justificativa vinha numa caixa com
 * borda nos quatro lados + `rounded-md` + fundo de papel: a silhueta do `Input`
 * do shadcn. O professor clicava para editar. Agora é citação: filete à esquerda.
 */
describe("MetadataDrawer — justificativa sem silhueta de campo (0266)", () => {
  it("não desenha a justificativa como caixa de input", () => {
    setup();
    const p = screen.getByText(META.justification);
    const cls = p.className.split(/\s+/);
    expect(cls).not.toContain("border");
    expect(cls).not.toContain("rounded-md");
    expect(cls).not.toContain("bg-surface-paper");
    expect(cls).toContain("border-l-2");
  });
});
