import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import LegalPage from "./LegalPage";
import { isLegalSlug, LEGAL_DOCS } from "@/lib/domain/legalDocs";
import { TERMS_VERSION } from "@/lib/domain/subscriptionUi";

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

  it("terms carry the trial clause and the current version", () => {
    const terms = LEGAL_DOCS.termos;
    const clause = terms.sections.find((s) => s.title === "4. Teste grátis");
    expect(clause).toBeDefined();
    expect(clause!.paragraphs.join(" ")).toMatch(/cartão de crédito válido/);
    expect(clause!.paragraphs.join(" ")).toMatch(/8º dia/);
    expect(clause!.paragraphs.join(" ")).toMatch(/um teste por CPF/);
    expect(terms.sections.map((s) => s.title)).toEqual([
      "1. O serviço", "2. Conta e acesso", "3. Planos, créditos e pagamento", "4. Teste grátis",
      "5. Cancelamento", "6. Uso aceitável", "7. Alterações",
    ]);
    expect(terms.sections.at(-1)!.paragraphs[0]).toContain(TERMS_VERSION);
  });

  it("reembolso describes the self-service refund flow, without an e-mail address", () => {
    const reembolso = LEGAL_DOCS.reembolso;
    expect(reembolso.sections.map((s) => s.title)).toEqual([
      "1. Estorno da última cobrança", "2. Créditos extras avulsos", "3. Como funciona",
    ]);
    expect(JSON.stringify(reembolso)).not.toMatch(/@/);
  });

  it("reembolso points the extras refund (not self-service) to the support channel in the account menu", () => {
    const reembolso = LEGAL_DOCS.reembolso;
    const extras = reembolso.sections.find((s) => s.title === "2. Créditos extras avulsos");
    expect(extras!.paragraphs.join(" ")).toMatch(/Peça pelo suporte no menu da sua conta\./);
  });

  it("privacidade points the LGPD request to the support channel in the account menu, without an e-mail address", () => {
    const privacidade = LEGAL_DOCS.privacidade;
    expect(JSON.stringify(privacidade)).not.toMatch(/@/);
    const rights = privacidade.sections.find((s) => s.title === "6. Seus direitos");
    expect(rights!.paragraphs.join(" ")).toMatch(
      /escrevendo para o suporte pelo menu da sua conta \(Suporte\), que mostra o e-mail de contato\./,
    );
  });
});
