import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import IsaSection from "./IsaSection";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/landing/isa.webp", () => ({ default: "stub://isa.webp" }));

describe("IsaSection", () => {
  it("is a labelled region titled 'Conheça a ISA'", () => {
    renderWithProviders(<IsaSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Conheça a ISA" });
    expect(heading).toHaveAttribute("id", "h-isa");
    expect(screen.getByRole("region", { name: "Conheça a ISA" })).toBeInTheDocument();
  });

  it("always writes ISA in capitals and uses the public brand", () => {
    const { container } = renderWithProviders(<IsaSection />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/ISA/);
    expect(text).not.toMatch(/\bIsa\b/);
    expect(text).toMatch(/Olhar Singular/);
    expect(text).not.toMatch(/Orientador Digital/);
    expect(screen.getByRole("img").getAttribute("alt")).not.toMatch(/\bIsa\b/);
  });

  it("states the real cost of a conversation", () => {
    renderWithProviders(<IsaSection />);
    expect(
      screen.getByText(
        "Cada conversa nova com a ISA custa 3 créditos; as mensagens seguintes da mesma conversa não custam, até o limite de mensagens por conversa indicado na tela.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the ISA illustration with intrinsic size, alt and lazy loading", () => {
    renderWithProviders(<IsaSection />);
    const img = screen.getByRole("img", { name: /assistente com tablet/i });
    expect(img).toHaveAttribute("src", "stub://isa.webp");
    expect(img).toHaveAttribute("width", "584");
    expect(img).toHaveAttribute("height", "880");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("labels the sample bubbles as an example, not a promise", () => {
    renderWithProviders(<IsaSection />);
    expect(screen.getByText("Exemplo de conversa")).toBeInTheDocument();
  });

  it("lists three sample exchanges, each with a question and an ISA answer", () => {
    renderWithProviders(<IsaSection />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(within(item).getByText("Pergunta:")).toBeInTheDocument();
      expect(within(item).getByText("Resposta da ISA:")).toBeInTheDocument();
    }
  });

  it("keeps the dark gradient that holds white text at 4.5:1 and the focus helper", () => {
    renderWithProviders(<IsaSection />);
    const section = screen.getByRole("region", { name: "Conheça a ISA" });
    expect(section).toHaveClass("from-lp-teal-deep", "to-lp-teal-text", "text-white", "lp-on-dark");
  });

  it("has no inline style, template tokens, dashes or placeholder values", () => {
    const { container } = renderWithProviders(<IsaSection />);
    expect(container.querySelector("[style]")).toBeNull();
    const dashes = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);
    expect(container.textContent).not.toMatch(/\{\{|undefined|NaN/);
    expect(container.textContent).not.toMatch(dashes);
  });
});
