import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import FeaturesSection from "./FeaturesSection";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/landing/prova-impressa.webp", () => ({ default: "stub://prova-impressa.webp" }));
vi.mock("@/assets/landing/perfis-celular.webp", () => ({ default: "stub://perfis-celular.webp" }));
vi.mock("@/assets/landing/historico.webp", () => ({ default: "stub://historico.webp" }));
vi.mock("@/assets/landing/justificativa.webp", () => ({ default: "stub://justificativa.webp" }));

describe("FeaturesSection", () => {
  it("labels the section by its heading", () => {
    const { container } = renderWithProviders(<FeaturesSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Tudo que você recebe" });
    const section = container.querySelector("section");
    expect(section).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading.id).not.toBe("");
  });

  it("renders the four cards in order as list items", () => {
    renderWithProviders(<FeaturesSection />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    const titles = items.map((item) => within(item).getByRole("heading", { level: 3 }).textContent);
    expect(titles).toEqual([
      "Prova adaptada pronta para imprimir",
      "Perfis de barreira salvos",
      "Suas adaptações guardadas",
      "Justificativa pedagógica de cada adaptação",
    ]);
  });

  it("gives every card a short description", () => {
    renderWithProviders(<FeaturesSection />);
    for (const item of screen.getAllByRole("listitem")) {
      const text = item.querySelector("p")?.textContent ?? "";
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it("renders one lazy image per card with size and alt text", () => {
    renderWithProviders(<FeaturesSection />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(4);

    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "stub://prova-impressa.webp",
      "stub://perfis-celular.webp",
      "stub://historico.webp",
      "stub://justificativa.webp",
    ]);

    for (const img of images) {
      expect(img).toHaveAttribute("width", "680");
      expect(img).toHaveAttribute("height", "457");
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("decoding", "async");
      expect(img.getAttribute("alt")?.length).toBeGreaterThan(20);
    }
  });

  it("does not promise unlimited or complete history", () => {
    const { container } = renderWithProviders(<FeaturesSection />);
    expect(container.textContent).not.toMatch(/ilimitad/i);
    expect(container.textContent).not.toMatch(/completo/i);
  });

  it("has no inline styles and no template tokens", () => {
    const { container } = renderWithProviders(<FeaturesSection />);
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.textContent).not.toContain("{{");
  });
});
