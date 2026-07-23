# Pacote de teste R$1 exclusivo do super-admin — Design

**Data:** 2026-07-22 · **Status:** aprovado (conversa) · **Escopo:** fluxo Créditos (Stripe)

## Objetivo

Permitir que **apenas o super-admin** compre um pacote de R$1,00 (1 crédito) em produção,
para exercitar o fluxo de pagamento real de ponta a ponta — checkout Stripe → webhook →
`grant_credits` — e ver a fatura chegar no cartão. O mínimo da Stripe para BRL é R$0,50,
então R$1,00 é válido.

## Decisões (com o usuário)

- **1 crédito** por R$1,00 (simbólico; valida o fluxo sem inflar saldo).
- **Só Stripe/cartão.** O fluxo Pix (Mercado Pago) segue apenas com os pacotes normais.
- Card visível só para super-admin na CreditsPage; landing page intocada.
- Gate real é **no backend**: usuário comum chamando a edge function direto com
  `{credits: 1, amountBrl: 1}` recebe 400 "Pacote inválido".

## Alternativas descartadas

- **Pacotes em tabela no banco** (flag de visibilidade): exigiria migration + RLS + pgTAP
  para um único pacote de teste. Overkill.
- **Payment Link no dashboard Stripe**: veria a fatura, mas não exercitaria nada do fluxo
  do app (edge fn, `credit_purchases`, webhook, `grant_credits`).

## Design

### 1. `supabase/functions/_shared/creditPackages.ts`

- Novo export `TEST_PACKAGE: CreditPackage = { credits: 1, amountBrl: 1.0 }` — **fora**
  de `ALLOWED_PACKAGES`.
- `findPackage(credits?, amountBrl?, options?: { allowTest?: boolean })`: só considera o
  `TEST_PACKAGE` quando `allowTest === true`. Chamadas existentes (Mercado Pago) não
  passam options → comportamento idêntico.

### 2. `supabase/functions/create-stripe-checkout/index.ts` (glue)

Após autenticar o usuário, consulta `profiles.is_super_admin` (client do próprio usuário;
RLS owner-based permite ler o próprio perfil) e chama
`findPackage(credits, amountBrl, { allowTest: isSuperAdmin })`. Todo o resto
(insert `credit_purchases`, sessão Stripe, webhook, `grant_credits`) fica intocado.

### 3. `src/pages/CreditsPage.tsx`

Quarto card "Teste (admin)" — 1 crédito · R$ 1,00 — renderizado apenas quando
`profile?.is_super_admin`, com **só** o botão de cartão (sem botão Pix; o Pix normal já
está desabilitado na página). Landing (`PricingSection`) não muda.

### 4. Testes

- `creditPackages.test.ts`: `TEST_PACKAGE` exportado; rejeitado sem flag/`allowTest:
  false`; aceito com `allowTest: true`; pacotes normais continuam casando com e sem flag.
- `CreditsPage.test.tsx`: card ausente para usuário comum (3 cards); presente para
  super-admin (4º card, singular "1 crédito", R$ 1,00, sem Pix extra); clique chama
  `create-stripe-checkout` com `{credits: 1, amountBrl: 1}`.
- Sem migration → pgTAP intocado. `index.ts` é glue (excluído da cobertura); a lógica de
  decisão vive no shared testado. Gate de 100% mantido.

## Rollout

Deploy da edge function `create-stripe-checkout` (CI de `supabase/**` ou
`supabase functions deploy`). Front sai pelo deploy normal (Vercel). A cobrança é live:
fatura real de R$1,00 no cartão (Stripe desconta a taxa dela; irrelevante para o teste).
