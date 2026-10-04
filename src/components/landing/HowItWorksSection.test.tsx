import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import HowItWorksSection from "./HowItWorksSection";
import { renderWithProviders } from "@/test/helpers";
import { MAX_ACTIVITY_CHARS } from "@/lib/domain/activityLimits";
import { ADAPTATION_COST_LABEL } from "@/lib/domain/subscriptionUi";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";

// Sentinels that differ from the real figures: a copy that hardcodes a number
// instead of reading the constant cannot pass. The real values are pinned in
// FaqSection.test.tsx.
vi.mock("@/lib/domain/subscriptionUi", () => ({ ADAPTATION_COST_LABEL: "4, 7 ou 9" }));
vi.mock("@/lib/domain/extractionCost", () => ({ EXTRACTION_COST: 6 }));

// The real wizard order: Tipo, Atividade, Barreiras, Gerar, Revisar, Exportar.
const STEP_TITLES = [/tipo/i, /atividade/i, /barreiras/i, /gere/i, /revise/i, /exporte/i];

function renderSection() {
  return renderWithProviders(<HowItWorksSection />);
}

describe("HowItWorksSection", () => {
  it("is the #como-funciona anchor, offset under the sticky header and labelled by its heading", () => {
    renderSection();
    const section = screen.getByRole("region", { name: "Como funciona" });
    expect(section).toHaveAttribute("id", "como-funciona");
    expect(section).toHaveClass("scroll-mt-20");
    expect(screen.getByRole("heading", { level: 2, name: "Como funciona" })).toBeInTheDocument();
  });

  it("lists the steps in the order of the real wizard", () => {
    renderSection();
    const headings = within(screen.getByRole("list")).getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(STEP_TITLES.length);
    STEP_TITLES.forEach((title, i) => expect(headings[i]).toHaveTextContent(title));
  });

  it("is an explicit list (role kept despite list-none) with one item per step", () => {
    renderSection();
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("role", "list");
    expect(list).toHaveClass("list-none");
    expect(within(list).getAllByRole("listitem")).toHaveLength(STEP_TITLES.length);
  });

  it("numbers the steps 01 to 06 in teal badges with white text", () => {
    renderSection();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    items.forEach((item, i) => {
      const badge = within(item).getByText(`0${i + 1}`);
      expect(badge).toHaveClass("bg-lp-teal-deep", "text-white");
      expect(badge).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("states the activity size limit from the shared constant, and only that figure", () => {
    const { container } = renderSection();
    const limit = MAX_ACTIVITY_CHARS.toLocaleString("pt-BR");
    expect(screen.getByText(new RegExp(`até ${limit} caracteres`))).toBeInTheDocument();
    // Every "N caracteres" figure on the section must be the constant (no stale limit).
    expect(container.textContent?.match(/\d[\d.]* caracteres/g)).toEqual([`${limit} caracteres`]);
  });

  it("mentions the PDF or Word upload and what reading it costs", () => {
    renderSection();
    expect(screen.getByText(/envie um PDF ou Word/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`custa ${EXTRACTION_COST} créditos`))).toBeInTheDocument();
  });

  it("says the result can be exported as PDF or Word", () => {
    renderSection();
    const exportItem = within(screen.getByRole("list")).getAllByRole("listitem")[5];
    expect(exportItem).toHaveTextContent(/PDF ou Word/);
  });

  it("states the adaptation cost range from the shared constant and that no diagnosis or report is needed", () => {
    renderSection();
    expect(screen.getByText(new RegExp(`custa ${ADAPTATION_COST_LABEL} créditos conforme a barreira`))).toBeInTheDocument();
    expect(screen.getByText(/Sem diagnóstico e sem laudo/)).toBeInTheDocument();
  });

  it("fits a 320px viewport: one column floor under the grid minimum", () => {
    renderSection();
    expect(screen.getByRole("list").className).toContain("grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))]");
  });

  it("ships no inline style, template token or dash characters", () => {
    const { container } = renderSection();
    expect(container.querySelector("[style]")).toBeNull();
    const banned = ["{{", String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
    banned.forEach((token) => expect(container.textContent).not.toContain(token));
  });
});
