import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
