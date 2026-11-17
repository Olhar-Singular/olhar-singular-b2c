# Checkout conversão, Parte 1 (cartão) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o `/assinar` do cartão conforme o briefing da EMX: textos novos, duas colunas com bloco de confiança, linha do tempo do teste, planos em "atividades adaptadas", botão próprio (barra fixa no mobile) e teste grátis com escolha de plano.

**Architecture:** Lógica de texto/datas em helpers puros (`src/lib/domain/checkoutCopy.ts`); blocos visuais em componentes pequenos em `src/components/subscribe/`; `SubscribePage` só compõe e orquestra. O botão do Brick some (`hidePaymentButton`) e um CTA nosso chama `cardPaymentBrickController.getFormData()` via handle do `MpCardBrick`. No servidor, o teste passa a usar o plano pedido (`loadPlan(planSlug)`), não o mais barato.

**Tech Stack:** React 18 + TS, Tailwind, shadcn, `@mercadopago/sdk-react` 1.0.7, Vitest + Testing Library, Deno (edge fn `subscribe`).

**Spec:** `docs/superpowers/specs/2026-11-15-checkout-conversao-design.md` (textos finais na seção 3).

## Global Constraints

- Textos de UI exatamente como na tabela "Textos finais" da spec; UI pt-BR, código e comentários em inglês.
- Nunca usar travessão (—) em texto de UI ou docs.
- TDD (Red → Green → Refactor) em toda mudança; gate de cobertura 100% (`vitest.config.ts`) não baixa.
- Não editar `src/components/ui/*` nem `src/integrations/supabase/types.ts`.
- Datas sempre calculadas (`date-fns`), nunca fixas; `TRIAL_DAYS = 7`, `TRIAL_CREDITS = 50`, `REFUND_WINDOW_DAYS = 30` reaproveitados de `subscriptionUi.ts`.
- Selo do plano destacado continua "Popular". Nenhuma menção a Stripe.
- Trabalhar na `main`; **nenhum commit sem aprovação explícita do dono** (os passos "Commit" abaixo só preparam a mensagem via skill `commit-crafting`).

## Review Focus

- Formulário do cartão incompleto ao clicar no CTA: `getFormData()` rejeita ou volta vazio; o CTA não chama `subscribe` e volta a ficar clicável. Teste na Task 3.
- Duplo clique no CTA: só uma chamada a `onSubmit`/`subscribe`. Teste na Task 5.
- Catálogo carregando ou vazio no modo teste: nada de "undefined" na tela, CTA desabilitado. Teste na Task 6.
- `?plano=` inválido ou admin-only no modo teste para não-admin: cliente cai no mais barato; servidor devolve `invalid_plan` para admin-only. Testes nas Tasks 2 e 6.
- Barra fixa no mobile cobrindo o último campo ou o rodapé legal, ou aparecendo fora do estágio `form`. Teste (classe de padding e ausência fora de `form`) na Task 6.

---

### Task 1: Helpers de texto e datas do checkout

**Files:**
- Create: `src/lib/domain/checkoutCopy.ts`
- Test: `src/lib/domain/checkoutCopy.test.ts`

**Interfaces:**
- Consumes: `ADAPTATION_CREDITS` (`@/lib/domain/barriers`), `formatBrl`, `TRIAL_DAYS` (`subscriptionUi.ts`), `PlanView`.
- Produces:
  - `adaptationsPerMonth(credits: number): { min: number; max: number }`
  - `planAdaptationsLabel(plan: PlanView): string` → `"25 a 60 atividades adaptadas por mês"`
  - `pricePerAdaptationLabel(plan: PlanView): string` → `"a partir de R$ 0,67 por adaptação"`
  - `type TrialStep = { key: "today" | "reminder" | "charge"; date: Date; dayNumber: number }`
  - `trialTimeline(start: Date): TrialStep[]`
  - `formatDayMonth(date: Date): string` → `"18/11"`

- [ ] **Step 1: Write the failing tests**

```ts
it("adaptationsPerMonth divides by the highest and lowest adaptation cost", () => {
  expect(adaptationsPerMonth(300)).toEqual({ min: 25, max: 60 });
  expect(adaptationsPerMonth(480)).toEqual({ min: 40, max: 96 });
  expect(adaptationsPerMonth(900)).toEqual({ min: 75, max: 180 });
});
it("planAdaptationsLabel speaks in adapted activities", () => {
  expect(planAdaptationsLabel(BASICO)).toBe("25 a 60 atividades adaptadas por mês");
});
it("pricePerAdaptationLabel rounds UP to the cent, never advertising less than the real price", () => {
  expect(pricePerAdaptationLabel(BASICO)).toMatch(/^a partir de R\$\s0,67 por adaptação$/);       // 39,90/60 = 0,665
  expect(pricePerAdaptationLabel(PROFISSIONAL)).toMatch(/R\$\s0,63/);                              // 59,90/96 = 0,624
  expect(pricePerAdaptationLabel(AVANCADO)).toMatch(/R\$\s0,56/);                                  // 99,90/180 = 0,555
});
it("trialTimeline: today (day 1), reminder 48 h before the charge (day 6), charge (day 8)", () => {
  const steps = trialTimeline(new Date(2026, 10, 13, 15, 0));
  expect(steps.map((s) => [s.key, formatDayMonth(s.date), s.dayNumber])).toEqual([
    ["today", "13/11", 1], ["reminder", "18/11", 6], ["charge", "20/11", 8],
  ]);
});
it("trialTimeline crosses a month boundary", () => {
  expect(trialTimeline(new Date(2026, 10, 28)).map((s) => formatDayMonth(s.date))).toEqual(["28/11", "03/12", "05/12"]);
});
```

- [ ] **Step 2: Run** `make test` filtrando `checkoutCopy` (ou `npx vitest run src/lib/domain/checkoutCopy.test.ts` no container). Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implement** em `checkoutCopy.ts`. Preço por adaptação: `Math.ceil(price * 100 / max) / 100` com `formatBrl`, calculado em centavos inteiros para evitar erro de float. Lembrete = `addDays(start, TRIAL_DAYS - 2)`; cobrança = `trialFirstChargeDate(start)`; `dayNumber` = dias corridos + 1.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit** (só após aprovação) `feat(checkout): helpers de atividades por plano e linha do tempo do teste`.

---

### Task 2: Teste grátis com o plano escolhido (servidor)

**Files:**
- Modify: `supabase/functions/_shared/subscribeFlow.ts` (deps e linha `const planRow = input.trial ? … : …`)
- Modify: `supabase/functions/subscribe/index.ts` (remover `loadCheapestPublicPlan` e o comentário da linha ~62)
- Modify: `src/hooks/useSubscription.ts:159` (comentário: o servidor usa o plano pedido)
- Test: `supabase/functions/_shared/subscribeFlow.test.ts`, `supabase/functions/_shared/accountProvision.test.ts` (fakes que ainda passam `loadCheapestPublicPlan`)

**Interfaces:**
- Produces: `SubscribeDeps` sem `loadCheapestPublicPlan`; `runSubscribe` com `trial: true` usa `deps.loadPlan(input.planSlug)`. Regras de `invalid_plan` (inativo, admin-only para não super-admin) valem igual no teste.

- [ ] **Step 1: Write the failing tests** em `subscribeFlow.test.ts`:
  - `"a trial runs on the requested plan"`: `trial: true, planSlug: "profissional"` → `loadPlan` chamado com `"profissional"`, `result.planSlug === "profissional"`, preapproval com o valor 59.9 e `start_date` = `trialEndsAt`.
  - `"a trial on an admin-only plan is refused for a non-admin"`: → `{ ok: false, error: "invalid_plan", httpStatus: 400 }` e nenhum `insertSubscription`.
  - Ajustar os testes de teste existentes que esperavam o plano mais barato.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared/subscribeFlow.test.ts`. Expected: FAIL no primeiro teste (usa o mais barato).
- [ ] **Step 3: Implement**: trocar o ternário por `deps.loadPlan(input.planSlug)`, remover `loadCheapestPublicPlan` da interface, do `index.ts` e dos fakes; atualizar o JSDoc de `trial` ("Trial with card on the requested plan, first charge in TRIAL_DAYS").
- [ ] **Step 4: Run** `npx vitest run supabase/functions/_shared/` e `make fn-check`. Expected: PASS; `fn-check` sem erro novo em `subscribe`.
- [ ] **Step 5: Commit** (só após aprovação) `feat(subscribe): teste grátis no plano escolhido`.

---

### Task 3: `MpCardBrick` com envio externo e fonte de 16px

**Files:**
- Modify: `src/components/payments/MpCardBrick.tsx`
- Test: `src/components/payments/MpCardBrick.test.tsx`

**Interfaces:**
- Produces:
  - `export interface MpCardBrickHandle { submit(): Promise<boolean> }` (true quando chegou a chamar `onSubmit` e ele resolveu; false para formulário inválido, controlador ausente ou `onSubmit` rejeitado)
  - `MpCardBrick` vira `forwardRef<MpCardBrickHandle, MpCardBrickProps>`; nova prop `hideSubmit?: boolean` → `customization.visual.hidePaymentButton = true`.
  - Customização sempre inclui `visual.style.customVariables.fontSizeMedium = "16px"` (objeto estável, módulo).

- [ ] **Step 1: Write the failing tests**
  - `"hides the Brick button and keeps 1x when hideSubmit"`: `cardPaymentProps` recebe `customization` com `visual.hidePaymentButton: true` e `paymentMethods.maxInstallments: 1`.
  - `"submit() reads the form through the controller and forwards the mapped card"`: `window.cardPaymentBrickController = { getFormData: vi.fn().mockResolvedValue({ token: "tok_1", payment_method_id: "master", issuer_id: "24", installments: 1, payer: {...} }) }`; `await ref.current.submit()` → `true`, `onSubmit` chamado com o mesmo mapeamento do teste atual de `onSubmit`.
  - `"submit() resolves false and skips onSubmit when the form is invalid"`: `getFormData` rejeita → `false`; resolve `null` → `false`; `onSubmit` não chamado.
  - `"submit() resolves false when onSubmit rejects (business refusal already toasted)"`.
  - `"submit() resolves false without a controller"` (`delete window.cardPaymentBrickController`).
  - `"asks the Brick for 16px text"`: `customization.visual.style.customVariables.fontSizeMedium === "16px"`.
- [ ] **Step 2: Run** `npx vitest run src/components/payments/MpCardBrick.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** com `useImperativeHandle`; tipo mínimo local para `window.cardPaymentBrickController.getFormData` (o sdk-react 1.0.7 cria o global mas não tipa `getFormData`). Manter o comentário sobre identidade estável das props e o `useMemo` da customização.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit** (só após aprovação) `feat(payments): enviar o cartão por botão próprio`.

---

### Task 4: Topo limpo no checkout anônimo

**Files:**
- Modify: `src/components/common/PublicShell.tsx`, `src/components/common/SubscribeRoute.tsx`
- Test: `src/components/common/PublicShell.test.tsx`, `src/components/common/SubscribeRoute.test.tsx`

**Interfaces:**
- Produces: `PublicShell({ children, checkout?: boolean })`. Com `checkout`: logo sem link, sem "Entrar", à direita ícone `Lock` + "Pagamento seguro · Mercado Pago". Rodapé igual.

- [ ] **Step 1: Write the failing tests**
  - `"checkout mode drops the login and the home link, and says payment is secured by Mercado Pago"`: `queryByRole("link", { name: "Entrar" })` null; `queryByRole("link", { name: /Olhar Singular/ })` null; texto `"Pagamento seguro · Mercado Pago"`; links de Termos/Privacidade/Reembolso presentes.
  - `SubscribeRoute`: `"uses the checkout shell for a visitor"` (sem "Entrar", com "Pagamento seguro · Mercado Pago").
- [ ] **Step 2: Run** os dois arquivos. Expected: FAIL.
- [ ] **Step 3: Implement**; `SubscribeRoute` passa `checkout`.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Commit** (só após aprovação) `feat(checkout): topo sem rota de saída`.

---

### Task 5: Blocos visuais do checkout

**Files:**
- Create: `src/components/landing/testimonials.ts` (move o array `TESTIMONIALS` de `TestimonialsSection.tsx`, exportado; a seção importa dele)
- Create: `src/components/subscribe/PlanPicker.tsx`, `TrialTimeline.tsx`, `TrustColumn.tsx`, `CheckoutCta.tsx`
- Test: um `.test.tsx` ao lado de cada componente novo

**Interfaces:**
- Consumes: Task 1 (`planAdaptationsLabel`, `pricePerAdaptationLabel`, `trialTimeline`, `formatDayMonth`), `formatBrl`, `formatDate`, `TRIAL_CREDITS`, `REFUND_WINDOW_DAYS`.
- Produces:
  - `PlanPicker({ plans: PlanView[]; selectedId: string | null; onSelect(slug: string): void; loading: boolean })`: `<section aria-labelledby>` com h2 "1. Escolha seu plano"; `role="group" aria-label="Planos"`; botões `aria-pressed` (mantém a decisão de não fingir radiogroup), `min-h-[44px]`, lista vertical abaixo de `sm`; badge "Popular" e "Só admins" como hoje; skeleton e estado vazio como hoje.
  - `TrialTimeline({ start: Date; plan: PlanView })`: `<ol aria-label="Como funciona o teste">` com os três passos e textos da spec.
  - `TrustColumn({ plan: PlanView; trial: boolean; firstCharge: Date | null })`: `<aside aria-label="Resumo e garantias">` com Resumo, O que você recebe, Depoimento (Cláudia M., sem `img` e sem avatar), Garantia, Selos.
  - `CheckoutCta({ label: string; payToday: string; note: string; mobileNote: string; disabled: boolean; onClick(): void })`: um único botão; no mobile `fixed inset-x-0 bottom-0` com "Você paga hoje {payToday}" e `mobileNote`; a partir de `lg` estático, sem a linha "Você paga hoje", com `note` abaixo. Ícone `ArrowRight` com `aria-hidden`.

- [ ] **Step 1: Write the failing tests** (um arquivo por componente):
  - `PlanPicker`: os três cards mostram `"25 a 60 atividades adaptadas por mês"` e `/300 créditos · a partir de R\$\s0,67 por adaptação/`; clicar em Profissional chama `onSelect("profissional")`; `aria-pressed` no selecionado; "Popular" só no destacado; skeleton com `loading`; "Nenhum plano disponível no momento." com lista vazia.
  - `TrialTimeline` (com `vi.setSystemTime` fixo ou `start` fixo 13/11/2026): textos "HOJE", "R$ 0,00", "Acesso liberado na hora, com 50 créditos para testar.", "18/11 · 6º dia", "Aviso por e-mail", "20/11 · 8º dia", `/R\$\s39,90\/mês/`, "Só se você continuar. Cancele antes e não paga nada.".
  - `TrustColumn` trial: "Você paga hoje" + "R$ 0,00"; "Primeira cobrança em 20/11/2026, com aviso por e-mail 2 dias antes."; os quatro itens; citação de Cláudia M. presente e **nenhum** `img` nem `testimonial-avatar`; Garantia de teste com "30 dias"; os três selos com "Mercado Pago". Pago: "Você paga hoje" + preço, "Renova todo mês na mesma data.", Garantia sem "8º dia".
  - `CheckoutCta`: botão com o rótulo; `disabled` respeitado; dois cliques com `disabled` alternando só chamam `onClick` uma vez enquanto `disabled` está true; texto "Você paga hoje" presente (classe `lg:hidden`).
  - `TestimonialsSection` existente continua passando (só muda a origem dos dados).
- [ ] **Step 2: Run** `npx vitest run src/components/subscribe src/components/landing/TestimonialsSection`. Expected: FAIL (componentes não existem).
- [ ] **Step 3: Implement** os quatro componentes e o módulo `testimonials.ts`. Visual segue o mockup (cards brancos `rounded-xl border`, valor de hoje em destaque `text-primary`, CTA com a cor de ação do app).
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit** (só após aprovação) `feat(checkout): blocos de plano, linha do tempo, confiança e CTA`.

---

### Task 6: `SubscribePage` com o layout e os textos novos

**Files:**
- Modify: `src/pages/SubscribePage.tsx`
- Test: `src/pages/SubscribePage.test.tsx` (o mock do `MpCardBrick` passa a ser `forwardRef` com `submit` que chama `props.onSubmit(CARD)`)

**Interfaces:**
- Consumes: Tasks 1, 3 e 5. Plano inicial no teste: `?plano=` se for plano público, senão `cheapestPublicPlan(plans)`; no pago, `pickInitialPlan` como hoje.
- Produces: estágio `form` em grid `lg:grid-cols-[minmax(0,1fr)_340px]`: coluna esquerda = cabeçalho (título, subtítulo, "Conta para … · Corrigir"), `AccountStep` quando falta a conta, `TrialTimeline` (só teste), `PlanPicker` (teste **e** pago), card do cartão com aviso de teste + `MpCardBrick hideSubmit ref` + `CheckoutCta`; coluna direita = `TrustColumn`. Raiz com `pb-40 lg:pb-8` para a barra fixa. Estágios de resultado (`authorized`, `pending`, `rejected`, `new_account`, `trial_used`) inalterados, sem CTA fixo.

- [ ] **Step 1: Write the failing tests** (reescrever o bloco `?trial=1` e ajustar os demais):
  - `"trial: new headline, Básico pre-selected, plans visible and the first-charge notice without the validation sentence"`: h1 "Comece hoje. Você só paga daqui a 7 dias."; grupo "Planos" visível com Básico `aria-pressed=true`; nota `Hoje: R$ 0,00. Em {formatDate(trialFirstChargeDate(now))} começa o plano Básico, R$ 39,90/mês. Cancele em 2 cliques antes dessa data e não é cobrado nada.`; `queryByText(/cobrança de validação/)` null; `queryByText(/Cancele antes em Créditos/)` null.
  - `"trial: choosing Profissional sends its slug with trial: true"`: clicar em Profissional, clicar em "Começar meus 7 dias grátis" → `mockSubscribe` com `planSlug: "profissional", trial: true`.
  - `"trial: honours a public ?plano= and ignores an admin-only one"`.
  - `"paid: headline Escolha seu plano and CTA Assinar por R$ 59,90/mês"`.
  - `"the CTA is disabled while the subscription is in flight and calls subscribe once"`.
  - `"no CTA while plans load or when there is no plan"` e `"no fixed CTA on result stages"` (após `authorized`, `queryByRole("button", { name: /Começar meus 7 dias/ })` null).
  - Atualizar os testes existentes que clicam em "Assinar agora" para o novo CTA; os de `trial_used`, `new_account` e Brick `onError` continuam.
- [ ] **Step 2: Run** `npx vitest run src/pages/SubscribePage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**: remover o `<p>` "Plano X · … a partir do 8º dia", o rodapé antigo do card e o texto de validação; `submitLabel` deixa de ser usado pela página (o CTA tem o rótulo). Estado `submitting` local ligado ao `await brickRef.current.submit()` para desabilitar o CTA.
- [ ] **Step 4: Run** `npx vitest run src/pages/SubscribePage.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** (só após aprovação) `feat(checkout): nova tela de assinatura com teste no plano escolhido`.

---

### Task 7: Landing e primeiro acesso

**Files:**
- Modify: `src/components/landing/PricingSection.tsx` (card do teste), `src/components/landing/FaqSection.tsx` (resposta do teste), `src/pages/SetPasswordPage.tsx:46`
- Test: `PricingSection.test.tsx`, `landingCopy.test.tsx` / `LandingPage.test.tsx` (onde houver o texto antigo), `SetPasswordPage.test.tsx`

- [ ] **Step 1: Write the failing tests**
  - Card do teste: `"Depois, a partir de R$ 39,90/mês, no plano que você escolher. Cancele antes e não paga nada."`.
  - FAQ do teste: contém `"No 8º dia cobramos o plano que você escolheu no checkout, a partir de R$ 39,90/mês, e sua conta passa a receber os créditos dele todo mês."` e não contém `"sua conta vira o plano Básico"`.
  - `SetPasswordPage`: após sucesso com sessão renovada, `navigate("/adaptar", { replace: true })`.
- [ ] **Step 2: Run** os arquivos. Expected: FAIL.
- [ ] **Step 3: Implement** os três textos/rotas.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Commit** (só após aprovação) `feat(landing): teste grátis no plano escolhido e primeiro acesso no Adaptar`.

---

### Task 8: Verificação e doc viva

- [ ] **Step 1:** `make test` com cobertura (`npm run test:coverage` no container). Expected: 100% nas quatro métricas.
- [ ] **Step 2:** `make lint` e `make fn-check`. Expected: sem erro novo.
- [ ] **Step 3:** Navegador (portal do Maestri, skill `maestri-portal`) com `make fn-serve-mp-test` e cartão de teste do MP: desktop 1280px e iPhone 390px no `/assinar?trial=1`. Conferir: topo limpo, linha do tempo com datas de hoje, barra fixa no mobile sem cobrir o último campo, CTA envia o Brick, campos do Brick com `font-size` ≥ 16px (se as iframes não obedecerem, registrar como limitação do MP na spec, seção 5).
- [ ] **Step 4:** Atualizar `.claude/skills/dominio-orientador/SKILL.md` (linhas 25 e 460: teste no plano escolhido, CTA próprio, `PublicShell checkout`) via skill `keeping-skills-current`.
- [ ] **Step 5:** Mostrar ao dono e aguardar aprovação para commit/push (skill `commit-crafting`).
