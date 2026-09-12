import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import LegalPage from "./LegalPage";
import { isLegalSlug, LEGAL_DOCS } from "@/lib/domain/legalDocs";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<LegalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("isLegalSlug", () => {
  it("accepts only the three documents", () => {
    expect(isLegalSlug("termos")).toBe(true);
    expect(isLegalSlug("privacidade")).toBe(true);
    expect(isLegalSlug("reembolso")).toBe(true);
    expect(isLegalSlug("outro")).toBe(false);
    expect(isLegalSlug(undefined)).toBe(false);
  });
});

describe("LegalPage", () => {
  it("renders the terms with the draft notice and links to the other documents", () => {
    renderAt("/termos");
    expect(screen.getByRole("heading", { level: 1, name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Rascunho/);
    expect(screen.getByText(/OLHAR SINGULAR/)).toBeInTheDocument();
    const others = within(screen.getByRole("navigation", { name: "Outros documentos" }));
    expect(others.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(others.getByRole("link", { name: "Política de Reembolso" })).toHaveAttribute("href", "/reembolso");
    expect(others.queryByRole("link", { name: "Termos de Uso" })).toBeNull();
  });

  it("renders every section of each document", () => {
    for (const slug of ["privacidade", "reembolso"] as const) {
      const { unmount } = renderAt(`/${slug}`);
      expect(screen.getByRole("heading", { level: 1, name: LEGAL_DOCS[slug].title })).toBeInTheDocument();
      for (const section of LEGAL_DOCS[slug].sections) {
        expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
      }
      unmount();
    }
  });

  it("shows a not-found message for an unknown slug", () => {
    renderAt("/inexistente/");
    expect(screen.getByRole("heading", { level: 1, name: /não encontrada/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar ao início/ })).toHaveAttribute("href", "/");
  });
});
