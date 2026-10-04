import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import PainSection from "./PainSection";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/landing/turma-diversa.webp", () => ({ default: "stub://turma-diversa.webp" }));

describe("PainSection", () => {
  it("is a region labelled by its h2 heading", () => {
    renderWithProviders(<PainSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Você reconhece isso?" });
    const region = screen.getByRole("region", { name: "Você reconhece isso?" });
    expect(region).toContainElement(heading);
    expect(region).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("lists exactly three pains, each with its own h3 and text", () => {
    renderWithProviders(<PainSection />);
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("role", "list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(within(item).getByRole("heading", { level: 3 }).textContent?.length).toBeGreaterThan(0);
      expect(item.textContent?.length).toBeGreaterThan(40);
    }
    expect(
      within(list).getByRole("heading", { name: "O domingo virou dia de adaptar material" }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("heading", { name: "Com aquele aluno, você não sabe por onde começar" }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("heading", { name: "A sensação de estar deixando alguém para trás" }),
    ).toBeInTheDocument();
  });

  it("shows the classroom image with alt, fixed dimensions and lazy loading", () => {
    renderWithProviders(<PainSection />);
    const img = screen.getByRole("img", { name: /professora ajudando alunos/i });
    expect(img).toHaveAttribute("alt", expect.stringMatching(/sala (de aula )?diversa e inclusiva/i));
    expect(img).toHaveAttribute("src", "stub://turma-diversa.webp");
    expect(img).toHaveAttribute("width", "1040");
    expect(img).toHaveAttribute("height", "784");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("closes with the reassurance line under the brand name Olhar Singular", () => {
    const { container } = renderWithProviders(<PainSection />);
    expect(screen.getByText(/Nada disso é falta de competência sua/)).toHaveTextContent(
      /Olhar Singular entra\.$/,
    );
    expect(container.textContent).not.toMatch(/Orientador Digital/);
  });

  it("has no template tokens, dashes, inline styles or placeholder text", () => {
    const { container } = renderWithProviders(<PainSection />);
    expect(container.textContent).not.toContain("{{");
    const dashes = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);
    expect(container.textContent).not.toMatch(dashes);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
