// Legal texts shown at /termos, /privacidade and /reembolso. Drafts until the
// legal review lands. The version shown is the one the checkout records on
// profiles.terms_version, so both move together.

import { SUPPORT_EMAIL } from "@/lib/constants";
import { TERMS_VERSION } from "@/lib/domain/subscriptionUi";

export type LegalSlug = "termos" | "privacidade" | "reembolso";

interface Section {
  title: string;
  paragraphs: string[];
}

interface LegalDoc {
  title: string;
  intro: string;
  sections: Section[];
}

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  termos: {
    title: "Termos de Uso",
    intro: "Estes termos regulam o uso da plataforma Olhar Singular, uma ferramenta pedagógica de apoio à adaptação de atividades com inteligência artificial.",
    sections: [
      {
        title: "1. O serviço",
        paragraphs: [
          "O Olhar Singular ajuda educadores a adaptar atividades para alunos com barreiras de aprendizagem observáveis em sala. A ferramenta não realiza diagnóstico, não substitui laudo e não substitui o profissional: a decisão final sobre qualquer material é sempre sua.",
          "O conteúdo gerado por IA pode conter erros. Revise tudo antes de usar com alunos.",
        ],
      },
      {
        title: "2. Conta e acesso",
        paragraphs: [
          "A conta é pessoal e nasce da assinatura de um plano, do teste grátis com cartão ou de um convite da equipe. Você é responsável por manter sua senha em sigilo e por tudo o que for feito com a sua conta.",
          "Contas criadas pelo pagamento recebem uma senha provisória e precisam definir a própria senha no primeiro acesso.",
        ],
      },
      {
        title: "3. Planos, créditos e pagamento",
        paragraphs: [
          "Os planos são mensais, pagos por cartão de crédito em parcela única, com renovação automática na mesma data de cada mês. A cada renovação, os créditos do plano são substituídos pela cota do mês; eles não acumulam.",
          "Créditos extras avulsos podem ser comprados por Pix ou cartão e não expiram. O consumo de créditos por operação (adaptação, extração de questões, conversa com a ISA) é informado na plataforma antes de cada uso.",
          "Os pagamentos são processados pelo Mercado Pago. A cobrança aparece na fatura como OLHAR SINGULAR.",
        ],
      },
      {
        title: "4. Teste grátis",
        paragraphs: [
          "O teste grátis de 7 dias exige um cartão de crédito válido, que é verificado no cadastro (uma cobrança simbólica de validação pode aparecer e é estornada pela operadora). Durante o teste nada é cobrado e a conta recebe 50 créditos.",
          "No 8º dia, salvo cancelamento anterior em Créditos, o cartão é cobrado pelo plano mensal mais barato em vigor e a conta passa a ser uma assinatura comum, com renovação automática. Cancelar antes do 8º dia encerra o acesso aos créditos do teste na hora e nada é cobrado.",
          "É um teste por CPF: quem já usou o teste ou já teve uma assinatura só assina um plano pago.",
        ],
      },
      {
        title: "5. Cancelamento",
        paragraphs: [
          "Você pode cancelar a assinatura a qualquer momento em Créditos. Não há nova cobrança e o acesso aos créditos do plano continua até o fim do período já pago.",
        ],
      },
      {
        title: "6. Uso aceitável",
        paragraphs: [
          "É proibido usar a plataforma para produzir conteúdo ilícito, discriminatório ou que viole direitos de terceiros, bem como tentar burlar o sistema de créditos ou acessar dados de outras contas.",
        ],
      },
      {
        title: "7. Alterações",
        paragraphs: [
          "Podemos atualizar estes termos. Mudanças relevantes serão comunicadas por e-mail ou na plataforma. Versão atual: " + TERMS_VERSION + ".",
        ],
      },
    ],
  },
  privacidade: {
    title: "Política de Privacidade",
    intro: "Como coletamos, usamos e protegemos os seus dados, em conformidade com a Lei Geral de Proteção de Dados (LGPD).",
    sections: [
      {
        title: "1. Dados que coletamos",
        paragraphs: [
          "Cadastro: nome e e-mail. Pagamento: o CPF do titular do cartão, informado ao Mercado Pago e guardado para fins fiscais e antifraude; os dados do cartão nunca passam pelos nossos servidores.",
          "Uso: as atividades e adaptações que você cria, o histórico de créditos e registros técnicos de acesso.",
        ],
      },
      {
        title: "2. Para que usamos",
        paragraphs: [
          "Para prestar o serviço (gerar adaptações, controlar créditos e cobranças), dar suporte e cumprir obrigações legais. Com o seu consentimento, para medir o desempenho do site e das campanhas.",
        ],
      },
      {
        title: "3. Inteligência artificial",
        paragraphs: [
          "O texto das atividades que você envia é processado por provedores de IA contratados para gerar a adaptação. Não envie dados pessoais de alunos: o Olhar Singular trabalha com barreiras pedagógicas, não com identidades.",
        ],
      },
      {
        title: "4. Compartilhamento",
        paragraphs: [
          "Compartilhamos dados apenas com os provedores necessários à operação (hospedagem, banco de dados, pagamento, IA) e quando exigido por lei. Não vendemos dados.",
        ],
      },
      {
        title: "5. Cookies e medição",
        paragraphs: [
          "Usamos cookies essenciais para manter sua sessão. Cookies de medição e marketing só são ativados depois do seu consentimento no aviso exibido no site, e você pode mudar a escolha a qualquer momento.",
        ],
      },
      {
        title: "6. Seus direitos",
        paragraphs: [
          "Você pode pedir acesso, correção, exclusão e portabilidade dos seus dados, além de revogar consentimentos, escrevendo para " + SUPPORT_EMAIL + ".",
        ],
      },
    ],
  },
  reembolso: {
    title: "Política de Reembolso",
    intro: "Regras para arrependimento, cancelamento e cobranças indevidas.",
    sections: [
      {
        title: "1. Arrependimento (7 dias)",
        paragraphs: [
          "Em até 7 dias corridos após a primeira cobrança de uma assinatura ou a compra de créditos extras, você pode pedir reembolso integral, desde que os créditos não tenham sido usados. Créditos parcialmente usados são reembolsados proporcionalmente, a nosso critério.",
        ],
      },
      {
        title: "2. Renovações",
        paragraphs: [
          "Renovações mensais não são reembolsadas depois de creditadas, salvo cobrança indevida. Para não ser cobrado, cancele antes da data de renovação indicada em Créditos.",
        ],
      },
      {
        title: "3. Como pedir",
        paragraphs: [
          "Escreva para " + SUPPORT_EMAIL + " com o e-mail da conta. O estorno é feito pelo Mercado Pago no mesmo meio de pagamento e pode levar até duas faturas para aparecer no cartão.",
        ],
      },
    ],
  },
};

export function isLegalSlug(value: string | undefined): value is LegalSlug {
  return value === "termos" || value === "privacidade" || value === "reembolso";
}

// Mounted at /termos, /privacidade and /reembolso: the path is the document.
