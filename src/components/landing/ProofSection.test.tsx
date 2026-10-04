import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ProofSection from "./ProofSection";

const BEFORE = { src: "/antes.webp", alt: "Prova original em preto e branco", width: 680, height: 457 };
const AFTER = { src: "/depois.webp", alt: "Prova adaptada com frases curtas", width: 680, height: 457 };

function tabs() {
  return {
    original: screen.getByRole("tab", { name: "Original" }),
    adaptada: screen.getByRole("tab", { name: "Adaptada" }),
  };
}

function panels() {
  const [original, adaptada] = screen.getAllByRole("tabpanel");
  return { original, adaptada };
}

describe("ProofSection", () => {
  it("renders a labelled section with the heading", () => {
    const { container } = render(<ProofSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Veja o que a IA entrega" });
    const section = container.querySelector("section");
    expect(section).toHaveAttribute("id", "prova");
    expect(section).toHaveAttribute("aria-labelledby", heading.id);
  });

  describe("tabs", () => {
    it("selects Adaptada by default with a roving tabindex", () => {
      render(<ProofSection />);
      const { original, adaptada } = tabs();
      expect(adaptada).toHaveAttribute("aria-selected", "true");
      expect(original).toHaveAttribute("aria-selected", "false");
      expect(adaptada).toHaveAttribute("tabindex", "0");
      expect(original).toHaveAttribute("tabindex", "-1");
    });

    it("labels the tablist", () => {
      render(<ProofSection />);
      expect(screen.getByRole("tablist")).toHaveAccessibleName("Escolher versão da atividade");
    });

    it("hides the tab row from 760px with a class on its wrapper only, never with the hidden attribute", () => {
      render(<ProofSection />);
      const tablist = screen.getByRole("tablist");
      const row = tablist.parentElement;
      expect(row).toHaveClass("min-[760px]:hidden");
      expect(tablist).not.toHaveClass("min-[760px]:hidden");
      expect(row).not.toHaveAttribute("hidden");
      expect(tablist).not.toHaveAttribute("hidden");
    });

    it("switches the selection on click", () => {
      render(<ProofSection />);
      fireEvent.click(tabs().original);
      const { original, adaptada } = tabs();
      expect(original).toHaveAttribute("aria-selected", "true");
      expect(adaptada).toHaveAttribute("aria-selected", "false");
      expect(original).toHaveAttribute("tabindex", "0");
      expect(adaptada).toHaveAttribute("tabindex", "-1");

      fireEvent.click(adaptada);
      expect(tabs().adaptada).toHaveAttribute("aria-selected", "true");
    });

    it("wires each tab to its panel through aria-controls and aria-labelledby", () => {
      render(<ProofSection />);
      const t = tabs();
      const p = panels();
      expect(t.original).toHaveAttribute("aria-controls", p.original.id);
      expect(t.adaptada).toHaveAttribute("aria-controls", p.adaptada.id);
      expect(p.original).toHaveAttribute("aria-labelledby", t.original.id);
      expect(p.adaptada).toHaveAttribute("aria-labelledby", t.adaptada.id);
      expect(new Set([t.original.id, t.adaptada.id, p.original.id, p.adaptada.id]).size).toBe(4);
    });

    it("moves focus and selection with ArrowRight and ArrowLeft, wrapping around", () => {
      render(<ProofSection />);
      const { original, adaptada } = tabs();

      fireEvent.keyDown(adaptada, { key: "ArrowRight" });
      expect(original).toHaveFocus();
      expect(original).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(original, { key: "ArrowRight" });
      expect(adaptada).toHaveFocus();
      expect(adaptada).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(adaptada, { key: "ArrowLeft" });
      expect(original).toHaveFocus();
      expect(original).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(original, { key: "ArrowLeft" });
      expect(adaptada).toHaveFocus();
      expect(adaptada).toHaveAttribute("aria-selected", "true");
    });

    it("jumps to the first tab with Home and to the last with End", () => {
      render(<ProofSection />);
      const { original, adaptada } = tabs();

      fireEvent.keyDown(adaptada, { key: "Home" });
      expect(original).toHaveFocus();
      expect(original).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(original, { key: "End" });
      expect(adaptada).toHaveFocus();
      expect(adaptada).toHaveAttribute("aria-selected", "true");
    });

    it("ignores other keys", () => {
      render(<ProofSection />);
      const { original, adaptada } = tabs();
      fireEvent.keyDown(adaptada, { key: "a" });
      fireEvent.keyDown(adaptada, { key: "Enter" });
      expect(adaptada).toHaveAttribute("aria-selected", "true");
      expect(original).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("panels", () => {
    it("lays the two panels side by side from 760px", () => {
      render(<ProofSection />);
      const { original } = panels();
      expect(original.parentElement).toHaveClass("grid", "min-[760px]:grid-cols-2");
    });

    it("keeps both panels in the DOM and hides the inactive one below 760px by class", () => {
      render(<ProofSection />);
      const before = panels();
      expect(before.original).toHaveClass("max-[759px]:hidden");
      expect(before.adaptada).not.toHaveClass("max-[759px]:hidden");
      expect(before.original).not.toHaveAttribute("hidden");
      expect(before.adaptada).not.toHaveAttribute("hidden");

      fireEvent.click(tabs().original);
      const after = panels();
      expect(after.original).not.toHaveClass("max-[759px]:hidden");
      expect(after.adaptada).toHaveClass("max-[759px]:hidden");
    });

    it("labels each panel with its role in the before and after comparison", () => {
      render(<ProofSection />);
      const { original, adaptada } = panels();
      expect(within(original).getByText("Antes: atividade original")).toBeInTheDocument();
      expect(within(adaptada).getByText("Depois: versão adaptada")).toBeInTheDocument();
    });
  });

  describe("images", () => {
    it("shows a neutral hidden placeholder when there are no images", () => {
      const { container } = render(<ProofSection />);
      expect(container.querySelector("img")).toBeNull();

      const { original, adaptada } = panels();
      const originalPlaceholder = within(original).getByText("Imagem da atividade original");
      const adaptedPlaceholder = within(adaptada).getByText("Imagem da atividade adaptada");
      expect(originalPlaceholder.closest("[aria-hidden='true']")).not.toBeNull();
      expect(adaptedPlaceholder.closest("[aria-hidden='true']")).not.toBeNull();
    });

    it("renders both images with dimensions, alt and lazy loading when provided", () => {
      render(<ProofSection beforeImage={BEFORE} afterImage={AFTER} />);
      const before = screen.getByRole("img", { name: BEFORE.alt });
      const after = screen.getByRole("img", { name: AFTER.alt });

      expect(before).toHaveAttribute("src", BEFORE.src);
      expect(before).toHaveAttribute("width", "680");
      expect(before).toHaveAttribute("height", "457");
      expect(before).toHaveAttribute("loading", "lazy");
      expect(before).toHaveAttribute("decoding", "async");
      expect(after).toHaveAttribute("src", AFTER.src);
      expect(after).toHaveAttribute("width", "680");
      expect(after).toHaveAttribute("height", "457");
      expect(after).toHaveAttribute("loading", "lazy");
      expect(after).toHaveAttribute("decoding", "async");

      expect(screen.queryByText(/Imagem da atividade/)).not.toBeInTheDocument();
    });

    it("mixes a real image with a placeholder when only one side is provided", () => {
      render(<ProofSection afterImage={AFTER} />);
      expect(screen.getByRole("img", { name: AFTER.alt })).toBeInTheDocument();
      expect(screen.getByText("Imagem da atividade original")).toBeInTheDocument();
      expect(screen.queryByText("Imagem da atividade adaptada")).not.toBeInTheDocument();
    });

    it("mixes the other way around when only the before image is provided", () => {
      render(<ProofSection beforeImage={BEFORE} />);
      expect(screen.getByRole("img", { name: BEFORE.alt })).toBeInTheDocument();
      expect(screen.getByText("Imagem da atividade adaptada")).toBeInTheDocument();
      expect(screen.queryByText("Imagem da atividade original")).not.toBeInTheDocument();
    });
  });

  describe("example markings", () => {
    it("lists three markings, each labelled as an example", () => {
      render(<ProofSection />);
      const list = screen.getByRole("list");
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      items.forEach((item) => {
        expect(within(item).getByText("Exemplo")).toBeInTheDocument();
        expect(within(item).getByRole("heading", { level: 3 })).toBeInTheDocument();
      });
    });

    it("describes what the adapted document does, without asserting an effect on the student", () => {
      render(<ProofSection />);
      const [first, second, third] = within(screen.getByRole("list")).getAllByRole("listitem");

      expect(within(first).getByRole("heading", { level: 3 })).toHaveTextContent(
        "Frases curtas, uma instrução por linha",
      );
      expect(first).toHaveTextContent("O enunciado é reescrito em frases curtas e cada instrução ocupa a sua própria linha.");

      expect(within(second).getByRole("heading", { level: 3 })).toHaveTextContent("Termo-chave com destaque visual");
      expect(second).toHaveTextContent(
        "O termo-chave da questão recebe um destaque visual e uma explicação curta ao lado.",
      );

      expect(within(third).getByRole("heading", { level: 3 })).toHaveTextContent("Exemplo resolvido antes da pergunta");
      expect(third).toHaveTextContent("Um exemplo resolvido aparece antes da questão, mostrando como a resposta é organizada.");

      const text = screen.getByRole("list").textContent ?? "";
      expect(text).not.toMatch(/reduz|melhora|garante|aumenta|facilita|deixa de ser|volta a avaliar|entende/i);
    });

    it("states that the AI records the pedagogical rationale, without promising a principle per item", () => {
      render(<ProofSection />);
      const intro = screen.getByText(/registra a justificativa pedagógica/i);
      expect(intro).toHaveTextContent("Exemplos de mudanças que uma adaptação pode trazer:");
      const list = screen.getByRole("list");
      expect(list).not.toHaveTextContent(/DUA/);
    });
  });

  it("has no template tokens, dashes or undefined in the copy", () => {
    const { container } = render(<ProofSection />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("{{");
    expect(text).not.toMatch(/[\u2013\u2014]/);
    expect(text).not.toContain("undefined");
  });

  it("has no inline styles", () => {
    const { container } = render(<ProofSection beforeImage={BEFORE} afterImage={AFTER} />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
