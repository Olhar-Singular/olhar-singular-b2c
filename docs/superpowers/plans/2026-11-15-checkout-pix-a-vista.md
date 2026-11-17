# Checkout Parte 2: Pix à vista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vender o plano à vista (1, 3 e 12 meses) no Pix dentro do `/assinar`, com conta criada na confirmação, liberação em duas partes e garantia de 7 dias.

**Architecture:** catálogo `prepaid_plans` + colunas novas em `credit_purchases` (`kind = 'plan'`); dinheiro só se move em RPCs `service_role` cobertas por pgTAP; `pix-plan-checkout` gera o QR, `mp-webhook` aprova/estorna pelo `kind`, `pix-plan-status` alimenta o polling público; a página ganha o seletor Cartão | Pix.

**Tech Stack:** Postgres/pgTAP, Deno edge functions (`_shared` + Vitest), React 18 + TanStack Query + Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-checkout-pix-a-vista-design.md` (regras R1 a R11, textos da seção 3).

## Global Constraints

- UI em pt-BR **sem travessão (U+2014)**; código e comentários em inglês.
- TDD em toda mudança; gate de cobertura 100% (`vitest.config.ts`) intocado.
- Não editar `src/components/ui/*`; `src/integrations/supabase/types.ts` só via `make gen-types`.
- Dinheiro/RLS testados em pgTAP (`supabase/tests/database/`); RPCs novas só `service_role`, sempre `CREATE OR REPLACE` + REVOKE/GRANT explícitos.
- Liberação: `PREPAID_UNLOCK_DAYS = 7` (entra no 8º dia); cota imediata = `credits / months`.
- Nada de commit, push, deploy de migration/function ou secret em produção.
- Valores: 1 mês R$ 39,90/300; 3 meses R$ 89,90/900 (`highlight`); 12 meses R$ 329,90/3.600; smoke admin-only R$ 1,00/1 crédito/1 mês.

## Review Focus

1. Webhook repetido (aprovação ou estorno chegando 2x) → nada é concedido ou removido duas vezes.
2. Compra de plano aprovada por `approve_purchase_and_grant` antigo → não vira crédito extra.
3. E-mail com maiúsculas/espaços no funil anônimo → mesma conta (normalização igual à do cartão).
4. Liberação do 8º dia depois de um estorno ou com o período já vencido → nada entra.
5. QR expirado na tela (1 h) → polling para e a pessoa pode gerar outro.

---

### Task 1: Esquema, catálogo e RPCs do plano à vista (pgTAP)

**Files:**
- Create: `supabase/migrations/20261115120000_prepaid_plans.sql`
- Create: `supabase/tests/database/prepaid_plans.test.sql`
- Modify (via comando): `src/integrations/supabase/types.ts` (`make gen-types`)

**Interfaces:**
- Produces: tabela `prepaid_plans(id, slug unique, months, credits, price_brl, highlight, sort_order, active, admin_only)`; `credit_purchases.kind/prepaid_plan_id/plan_months/buyer_email/buyer_name/terms_version/plan_locked_credits/plan_unlock_at/plan_released_at/refunded_at`; status `refunded`.
- RPCs (`service_role`): `user_id_by_email(p_email text) → uuid`; `approve_prepaid_plan(p_purchase_id uuid, p_payment_id text, p_user_id uuid) → jsonb {success, granted, reason?, user_id, credits_now, credits_locked, unlock_at, period_end}`; `release_prepaid_credits() → integer` (linhas liberadas); `refund_prepaid_plan(p_purchase_id uuid, p_payment_id text) → jsonb {success, refunded, credits_removed}`; `prepaid_plan_active(p_user_id uuid) → timestamptz` (fim do plano à vista ativo ou NULL).

- [ ] **Step 1: pgTAP falhando** com estes casos: catálogo visível a anon sem a linha admin-only e escrita negada (42501); `approve_purchase_and_grant` numa compra `kind='plan'` devolve `granted=false` e não mexe em extras; `approve_prepaid_plan` de 3 meses: 300 no balde, 600 travados, `plan_unlock_at = now()+7d`, `plan_period_end ≈ now()+3 meses`, `access_kind='subscriber'`, `terms_version` gravado quando a compra traz, ledger `plan_grant` +300; repetir a chamada → `granted=false`; recompra com plano ativo soma e estende a partir do fim atual; plano de 1 mês trava 0; `release_prepaid_credits` com `plan_unlock_at` no passado libera 600 uma vez só, não libera estornada nem com período vencido; `refund_prepaid_plan` remove os créditos liberados (limitado ao saldo), zera a trava, recua o fim (nunca antes de agora), status `refunded`, segunda chamada `refunded=false`; `user_id_by_email` ignora maiúsculas; `prepaid_plan_active` devolve o fim só para plano à vista aprovado, não estornado e vigente; anon/authenticated sem EXECUTE nas RPCs novas.
- [ ] **Step 2:** `make test-db` → FAIL (funções/tabela inexistentes).
- [ ] **Step 3:** migration. `release_prepaid_credits` agendada no pg_cron de hora em hora (`release-prepaid-credits`, `'7 * * * *'`), no mesmo bloco tolerante de `20260916000003`.
- [ ] **Step 4:** `make sb-reset && make test-db` → PASS; `make gen-types`.

### Task 2: Lógica do checkout Pix do plano (`_shared`)

**Files:**
- Create: `supabase/functions/_shared/prepaidPlans.ts` (+ `.test.ts`)
- Create: `supabase/functions/_shared/pixPlanCheckout.ts` (+ `.test.ts`)
- Modify: `supabase/functions/_shared/mpPixPayment.ts` (+ test): `buildPixPaymentBody` aceita `description?: string`.

**Interfaces:**
- `PrepaidPlanRow` (colunas da tabela), `PrepaidPlan {id, slug, months, credits, priceBrl, adminOnly}`, `toPrepaidPlan(row)`, `selectPrepaidPlan(rows, slug, {allowAdminOnly}) → PrepaidPlan | null`, `prepaidDescription(plan) → "Plano à vista 3 meses - Olhar Singular"`.
- `runPixPlanCheckout(input: PixPlanCheckoutInput, deps: PixPlanCheckoutDeps) → PixPlanCheckoutResult`.
  - input: `{ user: {id,email}|null; account: AccountInput|null; planSlug: string; clientIp: string; notificationUrl: string; now?: Date }`.
  - deps: `hash`, `recordAttempt` (mesmos do cartão), `loadPlans(slug)`, `isSuperAdmin(userId)`, `loadAccessKind(userId)`, `findLiveSubscription(userId)`, `userIdByEmail(email)`, `insertPurchase(row) → {id}`, `createPixPayment(body, idempotencyKey) → {ok, status, json}`, `storePaymentId(purchaseId, paymentId)`, `cancelPurchase(purchaseId)`, `log`.
  - result ok: `{ ok: true; purchaseId; qrCode; qrCodeBase64; ticketUrl?; expiresAt: string; amountBrl; credits; months }`; erros: `account_required`(400) `invalid_plan`(400) `exempt_user`(403) `already_subscribed`(409) `email_exists`(409) `rate_limited`/`circuit_open` (status do guard) `provider_error`(502).

- [ ] **Step 1:** testes: plano lido do banco e não do pedido; admin-only só para super-admin; anônimo com e-mail existente → `email_exists` sem inserir compra; logado com assinatura viva → `already_subscribed`; `exempt` → `exempt_user` (super-admin passa); rate limit → erro do guard e `recordAttempt("refused")`; compra inserida com `kind:'plan'`, `user_id` (logado) ou `buyer_email` normalizado + `buyer_name` + `terms_version` (anônimo), `amount_brl`/`credits_granted`/`plan_months` do catálogo; MP recebe `idempotencyKey = purchaseId` e `description` do plano; falha do MP → `cancelPurchase` + `provider_error`; sucesso grava `payment_id` e devolve `expiresAt` = now + 1 h; `recordAttempt("pending")` no sucesso.
- [ ] **Step 2:** `docker compose exec -T app npx vitest run supabase/functions/_shared/prepaidPlans.test.ts supabase/functions/_shared/pixPlanCheckout.test.ts supabase/functions/_shared/mpPixPayment.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** mesmo comando → PASS.

### Task 3: Liquidação no webhook, estorno, status e e-mail (`_shared`)

**Files:**
- Create: `supabase/functions/_shared/pixPlanSettlement.ts` (+ test)
- Create: `supabase/functions/_shared/prepaidEmails.ts` (+ test)
- Modify: `supabase/functions/_shared/mpEvents.ts` (+ test): `extractRefundedPurchase(payment) → MpPurchaseRef | null` (`refunded` | `charged_back`, referência uuid).

**Interfaces:**
- `settleApprovedPlan(input: {purchaseId; paymentId}, deps: PlanSettlementDeps) → {granted: boolean; userId?: string; accountCreated?: boolean}`.
  - deps: `loadPurchase(id) → {kind, status, user_id, buyer_email, buyer_name, plan_months, amount_brl, credits_granted} | null`, `userIdByEmail`, `createUser({email, fullName}) → {id} | "exists"`, `approve(purchaseId, paymentId, userId) → RPC payload`, `sendLoginLink(email)`, `sendConfirmation(input)`, `log`.
  - Ordem: compra pendente de plano → id pelo e-mail ou cria (corrida "exists" → relê) → `approve` → se `granted`: link de acesso (só compra anônima) e e-mail de confirmação, ambos best effort (falha só loga).
- `settleRefundedPlan({purchaseId, paymentId}, deps: {refund}) → {refunded, creditsRemoved}`.
- `publicPlanStatus(row) → "pending" | "approved" | "failed"` (`rejected`/`cancelled`/`refunded` → `failed`; linha de outro `kind` ou ausente → null).
- `buildPrepaidConfirmationEmail({fullName, months, credits, creditsNow, creditsLocked, unlockAt, periodEnd, amountBrl, appUrl}) → BuiltEmail`; `sendPrepaidConfirmation(deps, input & {to})`.

- [ ] **Step 1:** testes: compra `extra` ou não pendente → `granted:false` sem criar conta; anônima sem conta → cria, aprova com o id criado, manda link e confirmação; anônima com conta (lookup) → não cria, aprova, manda link; createUser "exists" → relê o id; `approve` com `granted:false` → nada é enviado; logada → sem link, com confirmação; falha de e-mail não derruba; estorno chama a RPC e devolve o payload; `extractRefundedPurchase` só para `refunded`/`charged_back`; `publicPlanStatus`; e-mail com e sem parte travada, sem travessão, HTML escapado.
- [ ] **Step 2:** vitest nos três arquivos → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** → PASS.

### Task 4: Functions (cola) e bloqueio do cartão com plano à vista

**Files:**
- Create: `supabase/functions/pix-plan-checkout/index.ts`, `supabase/functions/pix-plan-status/index.ts`
- Modify: `supabase/functions/mp-webhook/index.ts` (ramo por `kind`, estorno), `supabase/config.toml` (`verify_jwt = false` nas duas novas)
- Modify: `supabase/functions/_shared/subscribeFlow.ts` (+ test): dep `prepaidActiveUntil(userId) → Date | null`; com valor → `{ ok:false, error:"prepaid_active", httpStatus:409, until }`; `supabase/functions/subscribe/index.ts` (mensagem R6) e `accountProvision.ts` (propaga o erro).

- [ ] **Step 1:** teste do `subscribeFlow`: plano à vista ativo bloqueia antes de qualquer chamada ao MP.
- [ ] **Step 2:** vitest → FAIL; implementar; → PASS.
- [ ] **Step 3:** cola das functions sem lógica (deps montadas sobre o client admin; `sendLoginLink` = `createClient(url, anonKey).auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: APP_URL + '/definir-senha' } })`, conferindo o redirect do funil do cartão).
- [ ] **Step 4:** `make fn-check` → só os 8 erros antigos de `src/lib/adaptation`.

### Task 5: Domínio e hooks do front

**Files:**
- Modify: `src/lib/domain/checkoutCopy.ts` (+ test)
- Create: `src/hooks/usePrepaid.ts` (+ test)

**Interfaces:**
- `PrepaidPlanView {id, slug, months, credits, priceBrl, highlight, adminOnly}`; `DEFAULT_PREPAID_PLANS`; `publicPrepaidPlans(rows)`.
- `prepaidSavings(plan, base: PrepaidPlanView) → { percent: number; monthly: number } | null` (null para o próprio base); percentual `floor`, mensal `ceil` no centavo em inteiros.
- `prepaidCreditsSplit(plan) → { now: number; later: number }`; `prepaidMonthsLabel(months) → "1 mês" | "3 meses"`; `prepaidCardLines(plan, base) → { headline, adaptations, savings }` com os textos da spec.
- Hooks: `usePrepaidPlans()` (query `prepaid_plans`), `useCreatePixPlan()` (invoke `pix-plan-checkout`), `usePixPlanStatus(purchaseId, expiresAt)` (invoke `pix-plan-status` a cada 3 s, para em `approved`/`failed` ou depois de `expiresAt` → `expired`), `useActivePrepaid()` (última compra `kind='plan'` aprovada do usuário, para a área Créditos).

- [ ] **Step 1:** testes: 3 meses → 24% e R$ 29,97; 12 meses → 31% e R$ 27,50; 1 mês → null; split 900/3 → 300/600, 300/1 → 300/0; rótulos; hooks com `supabase` mockado (polling para no estado final e no vencimento).
- [ ] **Step 2:** → FAIL; implementar; → PASS.

### Task 6: Componentes do Pix

**Files:**
- Create: `src/components/subscribe/PaymentMethodToggle.tsx`, `PrepaidPlanPicker.tsx`, `PixPlanPayment.tsx` (+ tests)
- Modify: `src/components/subscribe/TrustColumn.tsx` (+ test): variante `mode: "card" | "pix"`.

**Interfaces:**
- `PaymentMethodToggle({ value: "card" | "pix"; onChange; trial: boolean })`: `role="radiogroup"` com dois `role="radio"`, setas trocam.
- `PrepaidPlanPicker({ plans; selectedId; onSelect; loading })`: mesmo padrão do `PlanPicker` (botões `aria-pressed`), título "1. Por quanto tempo você quer acesso?".
- `PixPlanPayment({ plan; account: AccountInput | null; anonymous; onPaid? })`: botão "Gerar meu código Pix" → QR + copia e cola + status (textos da spec); expirado/falhou → "Gerar novo código".
- [ ] **Step 1:** testes de render/teclado/estados (QR, copiar, confirmado anônimo e logado, expirado, erro de geração com mensagem do servidor) e da coluna Pix (Resumo e Garantia da spec).
- [ ] **Step 2:** → FAIL; implementar; → PASS.

### Task 7: Integração no `/assinar`

**Files:** `src/pages/SubscribePage.tsx` (+ test)

- [ ] **Step 1:** testes: seletor aparece depois da conta (anônimo) e logo no topo (logado); `?pagamento=pix` abre no Pix; no Pix somem Brick, timeline e PlanPicker e aparecem título/subtítulo do Pix, aviso do teste só com `?trial=1`, `PrepaidPlanPicker` com 3 meses pré-selecionado (o destacado) ou `?plano=` de plano à vista, `PixPlanPayment`; barra fixa com "Gerar meu código Pix"; trocar de método preserva a conta; recusa do cartão oferece "Pagar com Pix" que troca o método; erro 409 `prepaid_active` aparece no alerta.
- [ ] **Step 2:** → FAIL; implementar; → PASS.

### Task 8: Área Créditos, textos legais e doc viva

**Files:**
- Create: `src/components/credits/PrepaidPlanCard.tsx` (+ test); Modify: `src/pages/CreditsPage.tsx` (+ test)
- Modify: `src/lib/domain/legalDocs.ts` (+ test), `src/lib/domain/subscriptionUi.ts` (`TERMS_VERSION = "2026-11.1"`), `src/components/landing/FaqSection.tsx` (pergunta sobre Pix) (+ tests)
- Modify: `.claude/skills/dominio-orientador/SKILL.md`

- [ ] **Step 1:** testes: card com validade, "+600 créditos entram em dd/mm" enquanto travado, botão "Renovar no Pix" → `/assinar?pagamento=pix`; SubscriptionCard não convida a assinar quando há plano à vista ativo; Termos 5.12 e 7.4 e Reembolso seção nova citam 7 dias, devolução integral, liberação em duas partes; FAQ "Dá para pagar com Pix?".
- [ ] **Step 2:** → FAIL; implementar; → PASS.
- [ ] **Step 3:** doc viva (fluxo Pix à vista, RPCs, functions, gotchas).

### Task 9: Verificação

- [ ] `make test-db` PASS; cobertura completa 100% (`npm run test:coverage` no container); `make fn-check` sem erro novo; ESLint limpo nos arquivos tocados.
- [ ] Navegador (Maestri): `/assinar?pagamento=pix` desktop e 390 px, axe sem violações, QR simulado por stub de `fetch` das functions (o sandbox do MP não tem Pix).
- [ ] Preview do Vercel só da UI (o remoto não tem as migrations/functions novas: gerar o código mostra o erro do servidor).
