import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import LegalPage from "./LegalPage";
import { isLegalSlug, LEGAL_DOCS, LEGAL_ENTITY, LEGAL_NOTICE_DAYS } from "@/lib/domain/legalDocs";
import { EXTRAS_REFUND_DAYS, REFUND_WINDOW_DAYS, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

// Built from code points so this file itself carries no dash character.
const DASHES = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);
// Mirrors TERMS_RE in supabase/functions/_shared/accountProvision.ts: the checkout refuses anything else.
const TERMS_VERSION_RE = /^[a-z0-9.\-]{1,20}$/i;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<LegalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function sectionText(slug: keyof typeof LEGAL_DOCS, title: string): string {
  const section = LEGAL_DOCS[slug].sections.find((s) => s.title === title);
  expect(section, `section "${title}" of ${slug}`).toBeDefined();
  return section!.paragraphs.join(" ");
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
  it("renders the terms with the version, no draft notice, no update date and links to the other documents", () => {
    renderAt("/termos");
    expect(screen.getByRole("heading", { level: 1, name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.getByText(`Versão ${TERMS_VERSION}.`)).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(/Rascunho|revisão jurídica|Última atualização/)).toBeNull();
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

describe("LEGAL_DOCS", () => {
  it("every document has unique, numbered section titles and no update date", () => {
    for (const slug of ["termos", "privacidade", "reembolso"] as const) {
      const doc = LEGAL_DOCS[slug];
      expect(doc).not.toHaveProperty("updatedAt");
      const titles = doc.sections.map((s) => s.title);
      expect(new Set(titles).size).toBe(titles.length);
      titles.forEach((title, i) => expect(title).toMatch(new RegExp(`^${i + 1}\\. `)));
      for (const section of doc.sections) {
        expect(new Set(section.paragraphs).size).toBe(section.paragraphs.length);
      }
    }
  });

  it("was bumped with the October 2026 clause changes (confirmation e-mail, trial reminder, cookie preferences) and the version passes the checkout filter", () => {
    expect(TERMS_VERSION).toBe("2026-10.2");
    expect(TERMS_VERSION).toMatch(TERMS_VERSION_RE);
    expect(JSON.stringify(LEGAL_DOCS)).not.toMatch(DASHES);
    expect(JSON.stringify(LEGAL_DOCS)).not.toMatch(/data de atualização/);
    expect(JSON.stringify(LEGAL_DOCS.termos)).toContain("A versão vigente consta no topo desta página.");
    expect(JSON.stringify(LEGAL_DOCS.privacidade)).toContain("A versão vigente consta no topo desta página.");
  });

  it("interpolates every constant: no undefined or NaN leaks into the legal text (extras refund window included)", () => {
    expect(EXTRAS_REFUND_DAYS).toBe(7);
    expect(JSON.stringify(LEGAL_DOCS)).not.toMatch(/undefined|NaN/);
    expect(sectionText("reembolso", "4. Créditos extras avulsos")).toContain("Em até 7 dias corridos");
  });

  it("qualifies the company with CNPJ, address, e-mail and the named data-protection officer", () => {
    const opening = LEGAL_DOCS.termos.sections[0].paragraphs[0];
    expect(opening).toContain(LEGAL_ENTITY.cnpj);
    expect(opening).toContain(LEGAL_ENTITY.legalName);
    expect(opening).toContain(LEGAL_ENTITY.address);
    expect(opening).toContain(LEGAL_ENTITY.email);
    expect(LEGAL_DOCS.privacidade.sections[0].paragraphs[0]).toContain(LEGAL_ENTITY.cnpj);
    expect(LEGAL_DOCS.privacidade.sections[0].paragraphs[1]).toContain(LEGAL_ENTITY.dpo);
    expect(LEGAL_DOCS.privacidade.sections[0].paragraphs[1]).toContain(LEGAL_ENTITY.email);
    expect(sectionText("privacidade", "16. Contato")).toContain(LEGAL_ENTITY.email);
    expect(JSON.stringify(LEGAL_ENTITY)).not.toMatch(/\[/);
  });

  it("terms follow the Brazilian standard structure", () => {
    expect(LEGAL_DOCS.termos.sections.map((s) => s.title)).toEqual([
      "1. Identificação e definições",
      "2. Aceitação e capacidade",
      "3. O serviço",
      "4. Conta e acesso",
      "5. Planos, créditos e pagamento",
      "6. Teste grátis",
      "7. Cancelamento e direito de arrependimento",
      "8. Conteúdo do Usuário e dados de alunos",
      "9. Conteúdo Gerado por inteligência artificial",
      "10. Propriedade intelectual",
      "11. Uso aceitável",
      "12. Suspensão e encerramento",
      "13. Responsabilidade",
      "14. Indenização",
      "15. Privacidade e proteção de dados",
      "16. Comunicações e suporte",
      "17. Alterações destes Termos",
      "18. Disposições gerais",
    ]);
  });

  it("terms carry the trial clause with the real numbers and the current version", () => {
    const trial = sectionText("termos", "6. Teste grátis");
    expect(trial).toMatch(/cartão de crédito válido/);
    expect(trial).toContain(`${TRIAL_DAYS} dias`);
    expect(trial).toContain(`${TRIAL_CREDITS} créditos`);
    expect(trial).toContain(`No ${TRIAL_DAYS + 1}º dia`);
    expect(trial).toMatch(/um por CPF de titular de cartão/);
    expect(sectionText("termos", "17. Alterações destes Termos")).toContain(`Versão atual: ${TERMS_VERSION}.`);
  });

  it("terms describe the trial reminder exactly as the hourly job sends it: up to 48 h before, retried, cancel by the day before, refund on request if we fail", () => {
    const trial = sectionText("termos", "6. Teste grátis");
    expect(trial).toMatch(/faltarem até 48 horas para a primeira cobrança/);
    expect(trial).toMatch(/repetido a cada hora, para que o lembrete chegue, em regra, com pelo menos 24 horas de antecedência/);
    expect(trial).not.toMatch(/no mínimo, 24 horas|salvo falha de entrega/);
    expect(trial).toMatch(/dia anterior ao da cobrança/);
    expect(trial).toMatch(/lembrete .* não for enviado, ou for enviado com menos de 24 horas de antecedência da cobrança, a primeira cobrança poderá.* ser estornada integralmente a pedido/);
    expect(trial).toMatch(/Não se considera falha nossa a não entrega causada pelo seu provedor de e-mail ou por e-mail cadastrado incorreto/);
    expect(trial).not.toMatch(/2 dias antes|no mínimo 2 dias/);
    expect(trial).toMatch(/Cancelando até o dia anterior ao da primeira cobrança, nada é cobrado/);
    expect(trial).toMatch(/cancelamento feito no próprio dia pode acontecer depois dela; nesse caso o valor é estornado integralmente/);
    const refundTrial = sectionText("reembolso", "3. Teste grátis");
    expect(refundTrial).toMatch(/faltarem até 48 horas/);
    expect(refundTrial).toMatch(/dia anterior/);
    expect(refundTrial).toMatch(/não for enviado ou for enviado com menos de 24 horas de antecedência, a primeira cobrança pode ser estornada integralmente a pedido/);
    expect(refundTrial).toMatch(/sem prejuízo do estorno em autoatendimento/);
    expect(refundTrial).toContain(`antes do ${TRIAL_DAYS + 1}º dia, na área Créditos, nenhuma cobrança é feita`);
  });

  it("terms describe the confirmation e-mail with the content the subscribe function actually sends", () => {
    const acceptance = sectionText("termos", "2. Aceitação e capacidade");
    expect(acceptance).toMatch(/Enviamos ao e-mail da Conta \(ou, se ele não puder ser lido, ao e-mail informado no pagamento\) um e-mail de confirmação da contratação/);
    expect(acceptance).toMatch(/quando o pagamento é aprovado na hora no checkout ou o Teste Grátis é iniciado; quando a operadora deixa o cartão em análise no checkout e a aprovação chega depois; e quando uma assinatura encerrada é reativada por uma nova cobrança aprovada/);
    expect(acceptance).toMatch(/Não há novo e-mail de confirmação nas renovações mensais nem na primeira cobrança do Teste Grátis/);
    expect(acceptance).not.toMatch(/em todos os casos|Confirmado o pagamento ou iniciado/);
    for (const item of ["o plano", "o valor", "os créditos por mês", "a data da primeira cobrança", "todo mês, na mesma data", "a versão destes Termos aceita, quando disponível no momento do envio", "Política de Reembolso", "área Créditos"]) {
      expect(acceptance).toContain(item);
    }
    expect(acceptance).toMatch(/Guarde este e-mail/);
    expect(acceptance).toMatch(/Contas novas recebem também, no e-mail cadastrado, o link de acesso para definir a senha, mesmo com o cartão em análise/);
    expect(acceptance).toMatch(/créditos são liberados quando a aprovação chegar/);
    expect(acceptance).toMatch(/"Esqueci minha senha" na tela de acesso/);
    expect(acceptance).toContain(LEGAL_ENTITY.site);
    expect(acceptance).toMatch(/permanecem disponíveis em [^,]+, com a versão vigente, e podem ser salvos/);
    expect(acceptance).toMatch(/checkout de criação da Conta/);
    expect(acceptance).toMatch(/vinculad[oa] à versão aceita na criação da Conta ou, nas contas criadas por convite, à versão vigente no primeiro acesso, e às alterações comunicadas na forma da cláusula 17/);
  });

  it("terms separate the ISA charge (debited on creation, no reservation) from the reserved operations (adaptation, file reading)", () => {
    const credits = sectionText("termos", "5. Planos, créditos e pagamento");
    expect(credits).toMatch(/Nas adaptações e na leitura de arquivos, os créditos são reservados no início/);
    expect(credits).toMatch(/devolvidos automaticamente/);
    expect(credits).toMatch(/conversa nova .* debitado no momento em que ela é criada, sem reserva nem devolução automática/);
    expect(credits).toMatch(/não têm custo adicional, até o limite de mensagens por conversa e de conversas guardadas indicado na Plataforma; atingido o limite, iniciar outra conversa tem o custo informado antes de ela ser criada/);
    expect(sectionText("termos", "13. Responsabilidade")).not.toMatch(/devolução automática dos créditos \(cláusula 5\.5\)/);
    expect(sectionText("termos", "16. Comunicações e suporte")).toMatch(/confirmação da contratação, lembrete da primeira cobrança do Teste Grátis, avisos sobre cobranças, renovações e falhas de pagamento quando enviados por nós ou pelo Mercado Pago, segurança da Conta/);
  });

  it("terms state the pedagogical nature, the AI review duty, the age limit, the consumer forum and the CDC withdrawal right", () => {
    expect(sectionText("termos", "3. O serviço")).toMatch(/não realiza diagnóstico/i);
    expect(sectionText("termos", "3. O serviço")).toMatch(/revisar integralmente todo material/);
    expect(sectionText("termos", "2. Aceitação e capacidade")).toMatch(/maiores de 18 anos/);
    expect(sectionText("termos", "7. Cancelamento e direito de arrependimento")).toMatch(/art\. 49 do Código de Defesa do Consumidor/);
    expect(sectionText("termos", "8. Conteúdo do Usuário e dados de alunos")).toMatch(/proibido inserir .* dados pessoais de alunos/i);
    expect(sectionText("termos", "18. Disposições gerais")).toMatch(/foro do domicílio do Usuário/);
    expect(sectionText("termos", "5. Planos, créditos e pagamento")).toMatch(/aparece na fatura do cartão como OLHAR SINGULAR/);
  });

  it("terms carry the defensive rewrites: due process, CDC liability, reciprocal indemnity, takedown, unified notice", () => {
    expect(sectionText("termos", "12. Suspensão e encerramento")).toMatch(/aviso por e-mail com a indicação do motivo/);
    expect(sectionText("termos", "12. Suspensão e encerramento")).toMatch(/Contestação/);
    expect(sectionText("termos", "13. Responsabilidade")).toMatch(/art\. 14, § 3º, do CDC/);
    expect(sectionText("termos", "13. Responsabilidade")).not.toMatch(/no estado em que se encontra/);
    expect(sectionText("termos", "14. Indenização")).toMatch(/Cada parte responde/);
    expect(sectionText("termos", "8. Conteúdo do Usuário e dados de alunos")).toMatch(/Denúncias e retirada de conteúdo/);
    expect(sectionText("termos", "9. Conteúdo Gerado por inteligência artificial")).toMatch(/licencia a você/);
    for (const title of ["3. O serviço", "5. Planos, créditos e pagamento", "17. Alterações destes Termos"]) {
      expect(sectionText("termos", title)).toContain(`${LEGAL_NOTICE_DAYS} dias`);
    }
    expect(JSON.stringify(LEGAL_DOCS.termos)).not.toMatch(/liberalidade|antecedência razoável/);
  });

  it("the three documents quote one list of banned student data", () => {
    const terms = sectionText("termos", "8. Conteúdo do Usuário e dados de alunos");
    const policy = sectionText("privacidade", "4. Dados de alunos e de terceiros");
    const list = terms.match(/em especial: ([^.]+)\./)![1];
    expect(policy).toContain(list);
  });

  it("privacy policy names the controller, the DPO channel, the operators and the LGPD rights", () => {
    expect(sectionText("privacidade", "1. Quem somos e a quem esta Política se aplica")).toMatch(
      /pelo canal de Suporte, disponível no menu da sua conta na plataforma, que exibe o endereço de contato/,
    );
    const sharing = sectionText("privacidade", "7. Com quem compartilhamos");
    for (const operator of ["Supabase", "Vercel", "Mercado Pago", "Google", "Meta Platforms", "Resend"]) {
      expect(sharing).toContain(operator);
    }
    expect(sectionText("privacidade", "6. Inteligência artificial")).toMatch(/API Gemini/);
    expect(sectionText("privacidade", "12. Seus direitos")).toMatch(/art\. 18 da LGPD/);
    expect(sectionText("privacidade", "12. Seus direitos")).toMatch(/gov\.br\/anpd/);
    expect(sectionText("privacidade", "10. Por quanto tempo guardamos")).toMatch(/6 meses/);
    expect(sectionText("privacidade", "9. Cookies e tecnologias semelhantes")).toMatch(/Consent Mode v2/);
  });

  it("privacy policy lets the visitor reopen the consent banner from Preferências de cookies instead of clearing site data or asking support", () => {
    const cookies = sectionText("privacidade", "9. Cookies e tecnologias semelhantes");
    expect(cookies).toMatch(/link "Preferências de cookies", disponível no rodapé do site e no menu da sua conta/);
    expect(cookies).toMatch(/reabre a faixa/);
    expect(cookies).toMatch(/decisão anterior continua valendo até que você clique/);
    expect(cookies).not.toMatch(/peça a alteração/);
    expect(cookies).toMatch(/Como alternativa, apagar os dados deste site/);
    expect(cookies).toMatch(/Não injetamos novos scripts de medição ou marketing nas páginas de pagamento/);
    expect(cookies).toMatch(/já carregados com o seu consentimento em páginas anteriores podem permanecer ativos/);
    expect(cookies).not.toMatch(/Nenhum script de medição ou marketing é carregado/);
  });

  it("privacy policy lists the server-side conversion events and what each destination receives, as analyticsEvents.ts builds them", () => {
    const sharing = sectionText("privacidade", "7. Com quem compartilhamos");
    for (const moment of ["início de assinatura ou de teste grátis", "compra de créditos", "renovação da assinatura", "falha de pagamento", "cancelamento", "estorno"]) {
      expect(sharing).toContain(moment);
    }
    expect(sharing).toMatch(/Ao Google Analytics vai o identificador interno da sua conta/);
    expect(sharing).toMatch(/cookies de medição, o identificador do cookie _ga/);
    expect(sharing).toMatch(/à Meta vai esse identificador interno em hash irreversível \(SHA-256\)/);
    expect(sharing).toMatch(/valor e a moeda/);
    expect(sharing).toMatch(/e-mail \(em hash\) e os cookies de anúncios \(_fbp e _fbc\) só são incluídos .* cookies de marketing/);
    expect(sharing).toMatch(/confirmação da contratação e lembrete do teste grátis/);
    expect(sectionText("privacidade", "5. Para que usamos os dados e com base em quê")).toMatch(/eventos descritos na cláusula 7\.2/);
  });

  it("privacy policy names the file name and the technical error message among the AI metadata, and the lazy 24-hour purge of checkout hashes", () => {
    const collected = sectionText("privacidade", "3. Quais dados coletamos");
    expect(collected).toMatch(/o nome do arquivo enviado e a mensagem técnica de erro, quando houver/);
    expect(collected).toMatch(/não use nomes de alunos .* no nome dos arquivos/);
    expect(collected).toMatch(/por até 24 horas .* eliminados na verificação seguinte/);
    const ai = sectionText("privacidade", "6. Inteligência artificial");
    expect(ai).toMatch(/o nome do arquivo enviado e a mensagem técnica de erro/);
    expect(ai).toMatch(/não use nomes de alunos/);
    expect(sectionText("privacidade", "10. Por quanto tempo guardamos")).toMatch(/por até 24 horas, eliminados na verificação seguinte/);
  });

  it("reembolso describes the self-service refund flow with the real windows, without an e-mail address", () => {
    expect(JSON.stringify(LEGAL_DOCS.reembolso)).not.toMatch(/@/);
    expect(LEGAL_DOCS.reembolso.sections.map((s) => s.title)).toEqual([
      "1. Direito de arrependimento",
      "2. Estorno da última cobrança da assinatura",
      "3. Teste grátis",
      "4. Créditos extras avulsos",
      "5. Cobranças indevidas ou em duplicidade",
      "6. Como e quando o valor volta",
      "7. Contestação junto à operadora do cartão",
      "8. Encerramento pela plataforma",
    ]);
    expect(sectionText("reembolso", "1. Direito de arrependimento")).toMatch(/7 dias corridos/);
    expect(sectionText("reembolso", "2. Estorno da última cobrança da assinatura")).toContain(`${REFUND_WINDOW_DAYS} dias após cancelá-la`);
    expect(sectionText("reembolso", "3. Teste grátis")).toContain(`${TRIAL_DAYS + 1}º dia`);
    expect(sectionText("reembolso", "2. Estorno da última cobrança da assinatura")).not.toMatch(/liberalidade/);
    expect(sectionText("reembolso", "4. Créditos extras avulsos")).toMatch(/proporcional aos créditos não utilizados/);
    expect(sectionText("reembolso", "7. Contestação junto à operadora do cartão")).toMatch(/é um direito seu/);
    const extras = sectionText("reembolso", "4. Créditos extras avulsos");
    expect(extras).toContain(`${EXTRAS_REFUND_DAYS} dias corridos`);
    expect(extras).toMatch(/Peça pelo suporte no menu da sua conta\./);
  });
});
