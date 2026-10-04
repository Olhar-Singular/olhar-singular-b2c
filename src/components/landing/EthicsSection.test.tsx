import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import EthicsSection from "./EthicsSection";
import { renderWithProviders } from "@/test/helpers";

describe("EthicsSection", () => {
  it("labels the section with its heading", () => {
    renderWithProviders(<EthicsSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Ética e segurança" });
    expect(screen.getByRole("region", { name: "Ética e segurança" })).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("renders the four commitments as list items, each with its own heading", () => {
    renderWithProviders(<EthicsSection />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((item) => {
      expect(within(item).getByRole("heading", { level: 3 })).toBeInTheDocument();
    });
  });

  it("states what the tool does not do: no diagnosis and no medical report", () => {
    renderWithProviders(<EthicsSection />);
    expect(screen.getByRole("heading", { level: 3, name: /não diagnostica e não exige laudo/i })).toBeInTheDocument();
  });

  it("tells the teacher to review AI output before using it with students", () => {
    renderWithProviders(<EthicsSection />);
    expect(screen.getByRole("heading", { level: 3, name: /revise antes de usar/i })).toBeInTheDocument();
    expect(screen.getByText(/pode conter erros/i)).toBeInTheDocument();
  });

  it("says the teacher decides what goes into the document", () => {
    renderWithProviders(<EthicsSection />);
    expect(screen.getByRole("heading", { level: 3, name: /você decide o que entra/i })).toBeInTheDocument();
    expect(screen.getByText(/editar|edite/i)).toBeInTheDocument();
  });

  it("advises against student names and personal data, linking to the privacy policy", () => {
    renderWithProviders(<EthicsSection />);
    expect(screen.getByText(/nome completo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacidade/i })).toHaveAttribute("href", "/privacidade");
  });

  it("does not claim compliance or name conditions, and has no dash punctuation", () => {
    const { container } = renderWithProviders(<EthicsSection />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/LGPD/i);
    expect(text).not.toMatch(/nomeia condi/i);
    expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    expect(text).not.toMatch(/\{\{|undefined|NaN/);
  });

  it("hides the decorative icons from assistive tech and keeps inline styles out", () => {
    const { container } = renderWithProviders(<EthicsSection />);
    expect(container.querySelectorAll('li [aria-hidden="true"]')).toHaveLength(4);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
