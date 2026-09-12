# Pagamentos, Fase 1: cartão inline via Mercado Pago e remoção da Stripe (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extras (pacotes avulsos) passam a ser pagos com cartão **dentro da nossa página** via Card
Payment Brick do Mercado Pago, além do Pix que já existe; a Stripe sai do repositório; os pacotes
saem do código e vão para a tabela `credit_packages`. Nada do modelo de assinatura/baldes entra
aqui: ao fim desta fase o produto continua "créditos que nunca expiram", só com outro trilho de
cartão.

**Spec:** `docs/superpowers/specs/2026-09-11-pagamentos-assinatura-mp-design.md` (seções 4.1
`credit_packages`/`credit_purchases`, 4.3 F, 4.5 `MpCardBrick`/CSP, 4.7).

**Architecture:** Brick tokeniza no browser (`@mercadopago/sdk-react`, já instalado). O backend
novo `create-card-payment` valida o pacote pela tabela, insere `credit_purchases` (`pending`,
`provider 'mercadopago'`, `payment_method 'card'`) e faz `POST /v1/payments` com o token
(`binary_mode: true`, `installments: 1`, `statement_descriptor 'OLHAR SINGULAR'`). Aprovação
síncrona reaproveita exatamente o caminho do webhook (helper compartilhado `purchaseGrant.ts`:
`pending → approved` condicional + `grant_credits`), então cliente e webhook nunca creditam duas
vezes. Recusa grava `status 'rejected'` + `status_detail`. Toda regra vive em `_shared/*.ts`
puros; `index.ts` é glue.

**Tech Stack:** Deno edge functions; Postgres/RLS/pgTAP; React 18 + TanStack Query; Vitest (gate
100%); `@mercadopago/sdk-react` 1.0.7.

## Global Constraints

- **TDD**: Red → Green → Refactor em cada task. Nunca editar código sem teste que cubra a mudança.
- **Cobertura 100%** (`vitest.config.ts`): `_shared/**` incluído, `functions/**/index.ts` excluído.
  Nenhuma regra fica em `index.ts`.
- **Container**: `make test`, `make lint`, `make typecheck` rodam no container (`orientador-b2c-app`
  já está up). `make test-db` roda no host (Supabase local up).
- **Commits**: na branch `redesign/assinatura-mp`, um por task, Conventional Commits em pt-BR,
  `--no-verify` só se o hook depender de algo indisponível. **Zero push/deploy.**
- **Imports Deno**: relativo com `.ts` explícito; nada de `@/` em código alcançado por `index.ts`.
- **Idioma**: UI pt-BR; código/comentários em inglês. Nunca travessão em texto pt-BR.
- **Segredos**: nunca logar `payer`, token de cartão ou body de request. `console.error` só com
  ids e mensagens.
- **Arquivos protegidos**: `src/integrations/supabase/types.ts` só via `make gen-types`;
  `src/components/ui/*` intocável.

---

### Task 1: Migration `credit_packages` + ajustes em `credit_purchases`

**Files:**
- Create: `supabase/migrations/20260912000000_credit_packages.sql`
- Create: `supabase/tests/database/credit_packages_rls.test.sql`
- Modify: `supabase/tests/database/credit_purchases_payment_method.test.sql` (default do provider)
- Regenerate: `src/integrations/supabase/types.ts` (`make gen-types`)

**Schema:**
```sql
CREATE TABLE public.credit_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credits     integer NOT NULL CHECK (credits > 0),
  price_brl   numeric(10,2) NOT NULL CHECK (price_brl > 0),
  label       text NOT NULL,
  highlight   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  admin_only  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- RLS: SELECT anon+authenticated WHERE active AND (NOT admin_only OR caller is super-admin);
-- nenhuma policy de escrita (service_role bypassa). Trigger updated_at.
-- Seed: (30, 9.90, 'Básico', false, 1), (120, 29.90, 'Profissional', true, 2),
--       (300, 59.90, 'Avançado', false, 3), (1, 1.00, 'Teste (admin)', false, 99, admin_only = true)
--       com ON CONFLICT DO NOTHING via índice único parcial em (credits, price_brl).
ALTER TABLE public.credit_purchases ALTER COLUMN provider SET DEFAULT 'mercadopago';
ALTER TABLE public.credit_purchases ADD COLUMN status_detail text;
```
A policy usa `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)`
para o ramo `admin_only`.

- [ ] **Step 1 (RED):** escrever `credit_packages_rls.test.sql` (`plan(9)`): tabela existe; anon
  vê exatamente 3 linhas e nenhuma `admin_only`; authenticated comum vê 3; super-admin
  (`profiles.is_super_admin = true` setado como superuser) vê 4; authenticated não consegue
  `INSERT`/`UPDATE`/`DELETE` (`42501`); linha `active = false` não aparece; default do provider
  em `credit_purchases` é `'mercadopago'`; coluna `status_detail` existe. Ajustar
  `credit_purchases_payment_method.test.sql` para `'mercadopago'`. Rodar `make test-db`: falha.
- [ ] **Step 2 (GREEN):** escrever a migration; `make sb-reset` (reaplica) e `make test-db`: passa.
- [ ] **Step 3:** `make gen-types` e conferir `git diff src/integrations/supabase/types.ts` (só
  `credit_packages` + `status_detail`).
- [ ] **Step 4:** commit `feat(credits): mover os pacotes de crédito para a tabela credit_packages`.

---

### Task 2: `_shared/creditPackages.ts` passa a operar sobre linhas da tabela

**Files:**
- Modify: `supabase/functions/_shared/creditPackages.ts`, `creditPackages.test.ts`

**Interface:**
```ts
export interface CreditPackageRow { id: string; credits: number; price_brl: number | string;
  label: string; active: boolean; admin_only: boolean; }
export interface CreditPackage { id: string; credits: number; amountBrl: number; label: string; adminOnly: boolean; }
export function toCreditPackage(row: CreditPackageRow): CreditPackage;   // price_brl pode vir string do PostgREST
export function selectPackage(rows: CreditPackageRow[], id: unknown, opts?: { allowAdminOnly?: boolean }): CreditPackage | null;
// null quando id não é string, não existe, inativo, ou admin_only sem allowAdminOnly.
```
`ALLOWED_PACKAGES`/`TEST_PACKAGE`/`findPackage` são removidos (a fonte é a tabela).

- [ ] **Step 1 (RED):** reescrever `creditPackages.test.ts` para a nova API (inclui `price_brl`
  como string `"29.90"`, inativo, admin_only nos dois ramos, id não-string).
- [ ] **Step 2 (GREEN):** implementar. `make test` (arquivo) passa.
- [ ] **Step 3:** commit `refactor(credits): selecionar pacote pela tabela em vez da whitelist`.

---

### Task 3: builders puros do pagamento com cartão

**Files:**
- Create: `supabase/functions/_shared/mpCardPayment.ts` (+ `.test.ts`)
- Create: `supabase/functions/_shared/mpStatusDetail.ts` (+ `.test.ts`)

**Interfaces:**
```ts
// mpCardPayment.ts
export interface CardFormData { token: string; payment_method_id: string; issuer_id?: string | number;
  installments?: number; payer?: { email?: string; identification?: { type?: string; number?: string } }; }
export type ParsedCard = { ok: true; card: CardFormData } | { ok: false; error: string };
export function parseCardFormData(raw: unknown): ParsedCard;  // token e payment_method_id obrigatórios (strings não vazias); installments, se vier, deve ser 1
export const CARD_STATEMENT_DESCRIPTOR = "OLHAR SINGULAR";
export function buildCardPaymentBody(input: { pkg: CreditPackage; purchaseId: string; card: CardFormData;
  email: string; notificationUrl: string }): Record<string, unknown>;
// { transaction_amount: pkg.amountBrl, token, description: `${credits} crédito(s) - Olhar Singular`,
//   installments: 1, payment_method_id, issuer_id (só se vier; string), payer: { email, identification? },
//   external_reference: purchaseId, notification_url, statement_descriptor, binary_mode: true,
//   metadata: { purchase_id: purchaseId } }
export type CardOutcome = { status: "approved"; paymentId: string } | { status: "rejected"; paymentId: string | null; statusDetail: string }
  | { status: "pending"; paymentId: string | null; statusDetail: string | null };
export function interpretCardPayment(payment: { id?: string | number; status?: string; status_detail?: string }): CardOutcome;
export function maskPayer<T extends Record<string, unknown>>(body: T): T; // substitui payer/token por "[redacted]" para logs
// mpStatusDetail.ts
export function statusDetailMessage(detail: string | null | undefined): string; // pt-BR; fallback "O pagamento não foi aprovado. Tente outro cartão."
```
Mapa mínimo de `statusDetailMessage`: `cc_rejected_insufficient_amount`, `cc_rejected_bad_filled_card_number`,
`cc_rejected_bad_filled_date`, `cc_rejected_bad_filled_security_code`, `cc_rejected_bad_filled_other`,
`cc_rejected_call_for_authorize`, `cc_rejected_card_disabled`, `cc_rejected_duplicated_payment`,
`cc_rejected_high_risk`, `cc_rejected_max_attempts`, `cc_rejected_other_reason`, `cc_rejected_blacklist`.

- [ ] **Step 1 (RED):** testes cobrindo cada ramo (issuer_id number vira string; installments ≠ 1
  rejeita; identification ausente não gera chave; `interpretCardPayment` com status desconhecido
  cai em `pending`; `maskPayer` não muta o original).
- [ ] **Step 2 (GREEN):** implementar. `make test` passa.
- [ ] **Step 3:** commit `feat(credits): montar e interpretar o pagamento com cartão do Mercado Pago`.

---

### Task 4: helper compartilhado de aprovação/recusa da compra

**Files:**
- Create: `supabase/functions/_shared/purchaseGrant.ts` (+ `.test.ts`)
- Modify: `supabase/functions/mp-webhook/index.ts` (usa o helper; grava `status_detail` na recusa)

**Interface (cliente injetado, como `adminAuth.ts`):**
```ts
export interface PurchaseClient {
  from(table: "credit_purchases"): { update(values: Record<string, unknown>): { eq(c: string, v: string): { eq(c: string, v: string):
    { select(cols: string): { maybeSingle(): Promise<{ data: { user_id: string; credits_granted: number } | null; error: unknown }> } } } } };
  rpc(fn: "grant_credits", args: Record<string, unknown>): Promise<{ data: { success?: boolean; error?: string } | null; error: unknown }>;
}
export type GrantResult = { granted: true; userId: string; credits: number } | { granted: false; reason: "already_processed" } ;
export async function approvePurchaseAndGrant(client: PurchaseClient, input: { purchaseId: string; paymentId: string }): Promise<GrantResult>;
// UPDATE status='approved', payment_id WHERE id AND status='pending' RETURNING user_id, credits_granted;
// sem linha → already_processed; erro de update → throw; grant_credits via runCreditRpc (erro → throw).
export async function rejectPendingPurchase(client: PurchaseClient, input: { purchaseId: string; paymentId: string | null; statusDetail: string | null }): Promise<void>;
// UPDATE status='rejected', payment_id, status_detail WHERE id AND status='pending'; erro → throw.
```

- [ ] **Step 1 (RED):** testes com cliente fake (aprova e concede; já processada; erro de update
  lança; `grant_credits` com `success:false` lança `CreditRpcError`; recusa grava `status_detail`).
- [ ] **Step 2 (GREEN):** implementar; trocar o bloco equivalente no `mp-webhook/index.ts` pelo
  helper (comportamento idêntico). `make test` passa.
- [ ] **Step 3:** commit `refactor(credits): compartilhar a aprovação da compra entre webhook e checkout`.

---

### Task 5: edge function `create-card-payment`

**Files:**
- Create: `supabase/functions/create-card-payment/index.ts`
- Create: `supabase/functions/_shared/cardPaymentInput.ts` (+ `.test.ts`): `parseCardPaymentRequest(body)` → `{ ok, packageId, card }` reutilizando `parseCardFormData`.

**Fluxo do `index.ts`:** CORS → Bearer → `userClient.auth.getUser()` → body → `parseCardPaymentRequest`
(400) → `admin.from("credit_packages").select("*").eq("id", packageId).maybeSingle()` +
`profiles.is_super_admin` → `selectPackage([row], packageId, { allowAdminOnly })` (400 "Pacote
inválido.") → insert `credit_purchases` (`pending`, `mercadopago`, `card`) → `fetch POST
https://api.mercadopago.com/v1/payments` com `Authorization: Bearer ACCESS_TOKEN_MP_PROD`,
`X-Idempotency-Key: purchase.id`, body de `buildCardPaymentBody` → se `!resp.ok`: logar
`resp.status` + `maskPayer(errorJson)`, `rejectPendingPurchase(statusDetail: "mp_error")`, 502
"Não foi possível processar o cartão. Tente novamente." → `interpretCardPayment`:
`approved` → `approvePurchaseAndGrant` → 200 `{ status: "approved", purchaseId, creditsGranted }`;
`rejected` → `rejectPendingPurchase` → 200 `{ status: "rejected", purchaseId, statusDetail, message:
statusDetailMessage(detail) }`; `pending` → update `payment_id` → 200 `{ status: "pending", purchaseId }`.
Nunca 4xx para recusa de cartão (é resultado, não erro de request).

- [ ] **Step 1 (RED):** `cardPaymentInput.test.ts` cobrindo body inválido, `packageId` não string,
  cartão inválido, sucesso.
- [ ] **Step 2 (GREEN):** implementar `cardPaymentInput.ts` e o `index.ts`. `make test` passa;
  `denoImportGraph.test.ts` passa.
- [ ] **Step 3:** commit `feat(credits): cobrar créditos extras no cartão via Mercado Pago inline`.

---

### Task 6: `create-pix-payment` passa a receber `packageId`

**Files:**
- Modify: `supabase/functions/create-pix-payment/index.ts` (body `{ packageId }`, lookup na tabela,
  `selectPackage`), `supabase/functions/_shared/mpPixPayment.ts` (tipo `CreditPackage` novo; sem
  mudança de comportamento), testes correspondentes.

- [ ] **Step 1 (RED):** ajustar `mpPixPayment.test.ts` ao tipo novo (`label`, `id`) se quebrar.
- [ ] **Step 2 (GREEN):** trocar o parse do body e o lookup. `make test` passa.
- [ ] **Step 3:** commit `refactor(credits): ler o pacote do Pix pela tabela credit_packages`.

---

### Task 7: hooks do cliente

**Files:**
- Modify: `src/hooks/useCredits.ts`, `src/hooks/useCredits.test.ts`

**Interfaces:**
```ts
export interface CreditPackageView { id: string; credits: number; amountBrl: number; label: string; highlight: boolean; adminOnly: boolean; }
export function usePackages(): UseQueryResult<CreditPackageView[]>;   // queryKey ["credit_packages"], SELECT * FROM credit_packages WHERE active ORDER BY sort_order; price_brl Number(); staleTime 5 min
export function useCreatePixPayment(): UseMutationResult<PixPayment, Error, { packageId: string }>;
export interface CardPaymentResult { status: "approved" | "rejected" | "pending"; purchaseId: string; creditsGranted?: number; statusDetail?: string; message?: string; }
export function useCreateCardPayment(): UseMutationResult<CardPaymentResult, Error, { packageId: string; card: CardFormDataView }>;
export function usePurchaseStatus(purchaseId: string | null)  // renomeia usePixPurchaseStatus (mesma lógica, serve aos dois trilhos); manter export antigo como alias até a Task 9 remover
```
`useCreateStripeCheckout` e `CheckoutInput.method` saem, com seus testes.

- [ ] **Step 1 (RED):** testes novos (`usePackages` ordena e converte string→number; `useCreateCardPayment`
  invoca `create-card-payment` com `{ packageId, card }`, propaga o resultado, toast em erro e rede).
- [ ] **Step 2 (GREEN):** implementar; remover o bloco Stripe. `make test` passa.
- [ ] **Step 3:** commit `feat(credits): hooks para pacotes da tabela e pagamento com cartão inline`.

---

### Task 8: `MpCardBrick` + `CardPaymentDialog`

**Files:**
- Create: `src/components/payments/MpCardBrick.tsx` (+ `.test.tsx`)
- Create: `src/components/credits/CardPaymentDialog.tsx` (+ `.test.tsx`)
- Modify: `src/vite-env.d.ts` (tipar `VITE_MP_PUBLIC_KEY`)

**`MpCardBrick`:**
```tsx
interface Props { amount: number; payerEmail?: string; onSubmit: (card: CardFormDataView) => Promise<void>; onError?: (message: string) => void; }
// initMercadoPago(import.meta.env.VITE_MP_PUBLIC_KEY, { locale: "pt-BR" }) uma vez (módulo);
// sem a key → renderiza <p role="alert">Pagamento com cartão indisponível no momento.</p> e não monta o Brick;
// <CardPayment initialization={{ amount, payer: { email } }} customization={{ paymentMethods: { maxInstallments: 1 } }}
//   onSubmit={(formData) => onSubmit(pick(formData))} onError={(e) => onError?.(e.message)} locale="pt-BR" />
```
Nos testes, `vi.mock("@mercadopago/sdk-react", ...)` expõe um `CardPayment` fake que chama
`onSubmit` com um formData fixo ao clicar num botão.

**`CardPaymentDialog`:** props `{ pkg: CreditPackageView | null; onOpenChange }`. Estados:
`form` (Brick) → `submitting` → `approved` (texto + `refreshProfile()` + invalida
`["credit_transactions"]`) | `rejected` (mensagem do backend + botão "Tentar de novo" que remonta o
Brick) | `pending` (polling via `usePurchaseStatus`, mesmo padrão do `PixPaymentDialog`). Mesmos
`role="status"`/`aria-live` do Pix.

- [ ] **Step 1 (RED):** testes dos dois componentes (sem key; submit aprovado; recusa com mensagem e
  retry; pending que vira approved pelo polling; fechar limpa estado).
- [ ] **Step 2 (GREEN):** implementar. `make test` passa.
- [ ] **Step 3:** commit `feat(credits): formulário de cartão inline com o Card Payment Brick`.

---

### Task 9: `CreditsPage` com pacotes da tabela e cartão inline; `PricingSection` sem Stripe

**Files:**
- Modify: `src/pages/CreditsPage.tsx`, `CreditsPage.test.tsx`
- Modify: `src/components/landing/PricingSection.tsx` (+ test): só a linha "Pix ou cartão via
  Stripe" → "Pix ou cartão via Mercado Pago" (copy do modelo novo é Fase 4)
- Modify: `src/components/credits/PixPaymentDialog.tsx` (usa `usePurchaseStatus`)

`CreditsPage`: `usePackages()` renderiza os cards (skeleton enquanto carrega; `admin_only` já vem
filtrado pela RLS, então some o card especial de admin); botão "Cartão de crédito" abre
`CardPaymentDialog`; "Pix" chama `useCreatePixPayment({ packageId })`. Rodapé: "Pix ou cartão via
Mercado Pago. Créditos nunca expiram." (ainda verdadeiro nesta fase).

- [ ] **Step 1 (RED):** reescrever `CreditsPage.test.tsx` (mock `usePackages` com 3 pacotes; um
  botão de cartão e um de Pix por pacote; clique no cartão abre o diálogo com o pacote; clique no
  Pix invoca com `packageId`; sem pacotes mostra estado vazio; loading).
- [ ] **Step 2 (GREEN):** implementar. `make test` passa. Remover `usePixPurchaseStatus` alias.
- [ ] **Step 3:** commit `feat(credits): comprar créditos extras no cartão sem sair da página`.

---

### Task 10: remover a Stripe do repositório

**Files (delete):** `supabase/functions/create-stripe-checkout/`, `supabase/functions/stripe-webhook/`,
`supabase/functions/_shared/stripeCheckoutParams.ts(+test)`, `_shared/stripeEvents.ts(+test)`,
`src/pages/CreditsSuccessPage.tsx(+test)`.
**Files (modify):** `src/App.tsx` (rota e import), `supabase/config.toml` (remover bloco
`[functions.stripe-webhook]`, manter `mp-webhook`; acrescentar `[functions.create-card-payment]`? não:
é autenticada, default), `.env.example` (remover bloco Stripe; bloco MP ganha
`VITE_MP_PUBLIC_KEY=` com a nota "mesma aplicação do ACCESS_TOKEN_MP_PROD" e a seção "STAGING:
credenciais do usuário de teste vendedor, use com make fn-serve-mp-test"), `_shared/creditPackages.ts`
e `_shared/mpEvents.ts` (comentários), `supabase/tests/database/grant_credits.test.sql` (header),
`docs/superpowers/specs/2026-06-01-stripe-credit-card-design.md` e
`2026-07-22-pacote-teste-superadmin-design.md` (linha `**Status:** superado por 2026-09-11-pagamentos-assinatura-mp-design.md`).

- [ ] **Step 1:** `grep -rn -i stripe src supabase .env.example Makefile supabase/config.toml` e
  apagar/ajustar cada ocorrência (a `provider` CHECK das migrations antigas fica).
- [ ] **Step 2:** `make test` + `make lint` + `denoImportGraph` verdes; `App.test.tsx` sem a rota.
- [ ] **Step 3:** commit `chore(credits): remover a Stripe do código, da config e dos exemplos de env`.

---

### Task 11: Makefile, CSP e tooling Deno

**Files:**
- Modify: `Makefile` (`FUNCTIONS` derivado do disco; `fn-check`; `fn-serve-mp-test`), `vercel.json`
  (CSP), `.claude/docs/commands.md` (novos alvos)

```make
FUNCTIONS := $(notdir $(patsubst %/,%,$(dir $(wildcard supabase/functions/*/index.ts))))
fn-check:   ## type-check das functions com Deno via Docker (não há deno no host nem no container)
	docker run --rm -v "$(CURDIR)":/app -w /app denoland/deno:2.1.4 check $(foreach f,$(FUNCTIONS),supabase/functions/$(f)/index.ts)
fn-serve-mp-test:   ## serve as functions com as credenciais de TESTE do MP (seção STAGING do .env)
	@grep -vE '^(ACCESS_TOKEN_MP_PROD|VERIFY_TOKEN_MP_PROD)=' .env > .env.mp-test; \
	 echo "ACCESS_TOKEN_MP_PROD=$$(grep -E '^ACCESS_TOKEN_MP=' .env | cut -d= -f2-)" >> .env.mp-test; \
	 echo "VERIFY_TOKEN_MP_PROD=$$(grep -E '^VERIFY_TOKEN_MP=' .env | cut -d= -f2-)" >> .env.mp-test; \
	 supabase functions serve --env-file .env.mp-test; rm -f .env.mp-test
```
`.env.mp-test` entra no `.gitignore`. CSP (`vercel.json`): `script-src` + `https://sdk.mercadopago.com
https://http2.mlstatic.com https://www.mercadopago.com`; `connect-src` + `https://api.mercadopago.com
https://api.mercadolibre.com https://*.mercadopago.com https://*.mercadolibre.com`; `frame-src` +
`https://*.mercadopago.com https://*.mercadolibre.com`.

- [ ] **Step 1:** editar; `make fn-check` roda (puxa a imagem uma vez) e passa para todas as
  functions; `make -n fn-deploy-all` lista as functions reais.
- [ ] **Step 2:** commit `chore(infra): derivar FUNCTIONS do disco, checar Deno via Docker e liberar o MP na CSP`.

---

### Task 12: docs vivas

**Files:** `.claude/skills/dominio-orientador/SKILL.md` (linhas 14, 24, 255 a 260: cartão via MP
inline, `create-card-payment`, deploy pelo CI, pacotes na tabela), `.claude/agents/edge-fn-writer.md`
(árvore `_shared`, secrets `ACCESS_TOKEN_MP_PROD`/`VERIFY_TOKEN_MP_PROD`, remover `STRIPE_*`; corrigir a
menção à RPC `is_super_admin(uuid)`, que não existe: o padrão é `authorizeSuperAdmin`), `.claude/agents/rls-policy-writer.md`
e `migration-reviewer.md` (mesma correção), `.claude/docs/environment.md` (segredos `MP_*`, sem
`STRIPE_*`, `VITE_MP_PUBLIC_KEY`).

- [ ] **Step 1:** aplicar; `grep -rn -i "stripe\|is_super_admin(" .claude` só deve achar histórico.
- [ ] **Step 2:** commit `docs(skills): refletir o cartão inline via Mercado Pago e o fim da Stripe`.

---

### Task 13: validação da fase

- [ ] `make lint`, `make test` (218+ arquivos), `npm run test:coverage` no container (gate 100%),
  `make test-db`, `make fn-check`.
- [ ] Browser (skill `validate-adaptar`, com `make fn-serve-mp-test` no lugar do `fn-serve`):
  em `/creditos`, cartão de teste MP aprovado (titular `APRO`) credita na hora; titular `OTHE`
  recusa com mensagem pt-BR; Pix continua gerando QR. Registrar evidências no resumo final.
- [ ] Atualizar a memória do projeto (`payment-providers-split.md`): cartão agora é MP inline.
