# Pagamentos, Fase 2: dois baldes de crédito, trial e cortesia via admin, endurecimento (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (2026-09-12):** Tasks 1 a 9 concluídas e commitadas na branch `redesign/assinatura-mp`.
> Ajustes durante a execução: a compensação pula contas isentas; `admin_set_access_kind` inicia o
> trial na hora quando o e-mail já está confirmado; `AuthPage` ganhou suíte nova (só login); os
> CTAs da landing apontam para `#precos` e o card gratuito virou "Teste de 7 dias, por convite"
> (mailto de suporte) até a Fase 4 reescrever a copy; `fn-check` segue com os 15 erros pré-existentes.

**Goal:** O saldo deixa de ser um inteiro único. Passa a existir o **balde do plano** (`plan_credits`,
válido até `plan_period_end`, que também abriga os 50 créditos do trial) e o **balde extras**
(`credit_balance`, nunca expira). Consumo debita plano primeiro, extras depois; estorno volta ao
balde de origem. As flags "1ª adaptação/extração grátis" saem. O cadastro público termina
(`AuthPage` só login, `enable_signup = false`); trial e cortesia passam a ser estados de conta que
o admin atribui. Usuários existentes viram `legacy` (saldo vira extras, sem trial). O paywall é
suave: só adaptar, extrair e chat bloqueiam, com CTA para `/creditos`. Junto, fecham-se dois furos
pré-existentes de RLS (INSERT/DELETE do próprio perfil; INSERT no ledger).

**Spec:** `docs/superpowers/specs/2026-09-11-pagamentos-assinatura-mp-design.md` (4.1 `profiles`,
`credit_transactions`, `credit_reservations`; 4.2 exceto as RPCs de assinatura; 4.4; 4.5 Layout,
paywall, `AuthPage`; 4.6 leitura + "Alterar acesso"; 9 "Segurança e dinheiro", "Produto e copy").

**Architecture:** toda a regra de dinheiro vive em SQL (`consume_credits` é o único ponto que
debita; `deduct_credits` vira wrapper com a mesma assinatura para não reabrir ACL nem quebrar
`chat`). `open_adapt_reservation` ganha `p_kind` (`adapt`|`extract`) e passa a ser o caminho do
`extract-questions` também, com `settle`/`reverse` por balde. O cliente lê `profiles` (colunas
novas) e calcula o estado com `computeAccess()` (`src/lib/domain/access.ts`), puro e 100% testado;
o servidor aplica a mesma regra dentro da RPC. O trial começa na confirmação do e-mail por trigger
em `auth.users`, com `access_kind` vindo do `user_metadata` do convite.

**Tech Stack:** Postgres/RLS/pgTAP; Deno edge functions; React 18 + TanStack Query; Vitest (gate
100%).

## Global Constraints

- **TDD** e **cobertura 100%** (`vitest.config.ts`); `index.ts` continua fora: nenhuma regra nele.
- **RPCs de dinheiro**: só `CREATE OR REPLACE` mantendo assinatura, ou `REVOKE/GRANT` completo para
  assinatura nova; toda função nova revogada de `PUBLIC, anon, authenticated`.
- **`prevent_credit_self_mutation`** cobre TODA coluna nova de `profiles` listada abaixo.
- **Container** para Vitest/lint; `make test-db` no host; `supabase migration up` para aplicar as
  migrations novas no local (sem `db reset`); `make gen-types` depois de cada migration.
- **Commits** na branch `redesign/assinatura-mp`, um por task. **Zero push/deploy.**
- **Idioma**: UI pt-BR (sem travessão); código/comentários em inglês.
- **Estado ao final da fase**: usuário existente continua usando (saldo = extras); ninguém novo
  entra sem admin; sem link morto (CTA do paywall aponta para `/creditos`).

---

### Task 1: Migration de schema dos dois baldes + endurecimento de `profiles` e do ledger

**Files:**
- Create: `supabase/migrations/20260913000000_two_buckets_schema.sql`
- Create: `supabase/tests/database/two_buckets_schema.test.sql`
- Modify: `supabase/tests/database/credit_paywall_guard.test.sql` (+5 colunas, +INSERT/DELETE),
  `supabase/tests/database/rls_policies.test.sql` (INSERT no ledger passa a 42501),
  `supabase/tests/database/signup_credits.test.sql` (default 0, `access_kind` por metadata)

**Schema:**
```sql
ALTER TABLE public.profiles
  ADD COLUMN plan_credits      integer NOT NULL DEFAULT 0 CHECK (plan_credits >= 0),
  ADD COLUMN plan_period_end   timestamptz,
  ADD COLUMN access_kind       text NOT NULL DEFAULT 'subscriber'
    CHECK (access_kind IN ('subscriber','trial','exempt','legacy')),
  ADD COLUMN trial_started_at  timestamptz,
  ADD COLUMN cpf               text CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  ADD COLUMN must_set_password boolean NOT NULL DEFAULT false,
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN terms_version     text;
ALTER TABLE public.profiles ALTER COLUMN credit_balance SET DEFAULT 0;

-- Fim do INSERT/DELETE pelo dono (a linha nasce só por handle_new_user).
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
REVOKE INSERT, DELETE ON public.profiles FROM anon, authenticated;

-- Ledger só por RPC.
DROP POLICY IF EXISTS "Users can insert their own credit_transactions" ON public.credit_transactions;
REVOKE INSERT ON public.credit_transactions FROM anon, authenticated;
ALTER TABLE public.credit_transactions
  ADD COLUMN bucket text NOT NULL DEFAULT 'extra' CHECK (bucket IN ('plan','extra','exempt'));
ALTER TABLE public.credit_transactions DROP CONSTRAINT credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('signup_bonus','purchase','adapt','regenerate','chat','refund','extract',
                  'admin_grant','trial_grant','plan_grant','plan_reset','compensation','clawback'));

ALTER TABLE public.credit_reservations
  ADD COLUMN plan_charged       integer NOT NULL DEFAULT 0 CHECK (plan_charged >= 0),
  ADD COLUMN extra_charged      integer NOT NULL DEFAULT 0 CHECK (extra_charged >= 0),
  ADD COLUMN period_end_at_open timestamptz;
ALTER TABLE public.credit_reservations DROP CONSTRAINT credit_reservations_kind_check;
ALTER TABLE public.credit_reservations ADD CONSTRAINT credit_reservations_kind_check
  CHECK (kind IN ('adapt','extract'));

-- Guard: as colunas novas entram na lista (CREATE OR REPLACE, ACL preservada).
-- handle_new_user: access_kind := raw_user_meta_data->>'access_kind' se em ('trial','exempt').
```

- [x] **RED:** `two_buckets_schema.test.sql` (colunas e defaults; `access_kind` inválido falha;
  `cpf` com letra falha; `handle_new_user` com `access_kind: 'trial'` no metadata cria perfil
  `trial`, com `'hacker'` cria `subscriber`); `credit_paywall_guard` com `throws_ok` para
  `plan_credits`, `plan_period_end`, `access_kind`, `cpf`, `must_set_password` e para
  `INSERT`/`DELETE` em `profiles` como authenticated; `rls_policies`: INSERT no ledger → 42501;
  `signup_credits`: `credit_balance = 0`, `plan_credits = 0`, `access_kind = 'subscriber'`.
  `make test-db` falha.
- [x] **GREEN:** migration; `supabase migration up`; `make test-db` passa; `make gen-types`.
- [x] Commit `feat(credits): dois baldes no schema e fim do INSERT/DELETE do próprio perfil`.

---

### Task 2: RPCs de consumo por balde

**Files:**
- Create: `supabase/migrations/20260913000001_consume_credits.sql`
- Create: `supabase/tests/database/consume_credits_two_buckets.test.sql`
- Modify: `supabase/tests/database/deduct_credits.test.sql` (guards e `new_balance` preservados;
  casos de plano), `supabase/tests/database/credit_reservations.test.sql` (reescrever sem `free`),
  delete `supabase/tests/database/free_adaptation_claim.test.sql`

**RPCs:**
```sql
-- consume_credits(p_user_id, p_amount, p_type, p_ref_id) → jsonb
--   FOR UPDATE no perfil; guards 'amount must be positive' e 'invalid type' (mesmos textos);
--   exempt → ledger delta 0 bucket 'exempt', {success:true, mode:'exempt', plan_charged:0,
--   extra_charged:0, plan_balance, extra_balance, new_balance};
--   plan_available = plan_credits se plan_period_end > now() senão 0;
--   insuficiente → {success:false, error:'insufficient_credits', balance (total), plan_balance, extra_balance};
--   senão plano primeiro, extras depois; uma linha de ledger por balde tocado;
--   {success:true, mode:'charged', plan_charged, extra_charged, plan_balance, extra_balance, new_balance}.
-- deduct_credits(uuid,int,text,uuid) → wrapper: RETURN consume_credits(...).
-- open_adapt_reservation(uuid,uuid,int) → mantém assinatura; sem free-first; kind 'adapt';
--   grava plan_charged/extra_charged/period_end_at_open; mode 'charged'|'exempt'.
-- open_credit_reservation(p_request_id, p_user_id, p_amount, p_kind) → versão com kind
--   ('adapt'|'extract'); open_adapt_reservation delega a ela.
-- reverse_credit_reservation(uuid) → plano volta só se plan_period_end = period_end_at_open e > now();
--   senão parcela do plano descartada (ledger 'refund' delta 0, bucket 'plan'); extras voltam.
-- reconcile_stale_credit_reservations: sem 'free_released' (mantém a chave com 0 por compatibilidade).
```

- [x] **RED:** `consume_credits_two_buckets.test.sql` (plano primeiro; plano expirado ignora;
  isento não debita e gera ledger 0; insuficiente com totais; ledger por balde; wrapper
  `deduct_credits` devolve os mesmos campos antigos). `credit_reservations.test.sql` reescrito:
  fixtures com `plan_credits/plan_period_end`, reserva mista (plano 5 + extra 7), estorno de
  origem, estorno após expiração descarta a parcela do plano, reconciliação. Apagar
  `free_adaptation_claim.test.sql`. `make test-db` falha.
- [x] **GREEN:** migration; `migration up`; `make test-db` passa; `make gen-types`.
- [x] Commit `feat(credits): consumir do plano antes dos extras e estornar ao balde de origem`.

---

### Task 3: Trial, cortesia e acesso pelo admin (RPCs + trigger)

**Files:**
- Create: `supabase/migrations/20260913000002_trial_and_access.sql`
- Create: `supabase/tests/database/trial_on_confirm.test.sql`, `admin_access.test.sql`
- Modify: `supabase/tests/database/function_hardening.test.sql` (+`start_trial_on_confirm`)

**RPCs/trigger:**
```sql
-- start_trial_on_confirm(): AFTER UPDATE OF email_confirmed_at ON auth.users
--   WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL);
--   se access_kind='trial' e trial_started_at IS NULL → plan_credits=50, plan_period_end=now()+7d,
--   trial_started_at=now(), ledger trial_grant (bucket plan); EXCEPTION WHEN OTHERS → WARNING.
--   Mesmo corpo chamado por handle_new_user quando NEW.email_confirmed_at IS NOT NULL.
-- admin_extend_trial(p_user_id, p_days) → só trial com trial_started_at; presets validados no edge;
--   teto 90 dias desde trial_started_at; FOR UPDATE.
-- admin_set_access_kind(p_user_id, p_kind) → 'legacy'|'trial'|'exempt' (nunca 'subscriber' por aqui);
--   trial: zera trial_started_at/plan_* para o trigger... não: se o e-mail já está confirmado,
--   inicia o trial na hora (mesma função interna). exempt: mantém saldos. legacy: idem.
-- REVOKE/GRANT em todas.
```

- [x] **RED:** `trial_on_confirm.test.sql` (INSERT trial sem confirmação não inicia; UPDATE de
  `email_confirmed_at` inicia uma vez e só uma; INSERT já confirmado inicia; `subscriber`
  confirmado não ganha nada); `admin_access.test.sql` (extend 7/14/30, teto 90, recusa sem
  `trial_started_at`, `set_access_kind` para exempt/legacy/trial confirmado, ACL 42501).
- [x] **GREEN:** migration; `make test-db`; `make gen-types`.
- [x] Commit `feat(credits): trial que começa na confirmação do e-mail e acesso definido pelo admin`.

---

### Task 4: Migração de dados (legacy, compensação, compras presas, super-admins)

**Files:**
- Create: `supabase/migrations/20260913000003_legacy_access_migration.sql`
- Create: `supabase/tests/database/legacy_migration.test.sql`

```sql
UPDATE profiles SET access_kind = 'legacy' WHERE access_kind = 'subscriber';   -- todo mundo que existe
UPDATE profiles SET access_kind = 'exempt' WHERE is_super_admin;
-- compensação: +12 (adapt) e +5 (extract) em credit_balance, ledger 'compensation' bucket 'extra', só uma vez
-- (idempotência: WHERE NOT EXISTS ledger compensation para o user)
-- credit_purchases pending: sem payment_id OU created_at < now() - 30 days → 'cancelled', status_detail 'stale';
-- demais listadas em RAISE NOTICE (conferir no MP antes do deploy).
-- RAISE NOTICE dos payment_id Stripe aprovados sem ledger 'purchase' correspondente.
```
Como a migration roda também no CI/local vazio, tudo é idempotente e tolera zero linhas. O teste
cria fixtures **antes** de chamar a lógica: a migration expõe a lógica numa função
`public.migrate_legacy_access()` (service_role only) e a chama uma vez; o teste chama de novo
sobre fixtures e confere idempotência.

- [x] **RED/GREEN** como acima. Commit `feat(credits): migrar usuários existentes para o estado legacy com compensação`.

---

### Task 5: `_shared` e edge functions

**Files:**
- Modify: `supabase/functions/_shared/credits.ts` (+`ChargeOutcome` `exempt`; `chargeCredits` lê `mode`),
  `creditReservation.ts` (+`exempt`, +`planCharged/extraCharged`; `reservationErrorResponse` 402 com
  `plan_balance/extra_balance`), testes correspondentes
- Modify: `supabase/functions/adapt-activity/index.ts` (sem `is_first_free`; `credits_charged`),
  `supabase/functions/extract-questions/index.ts` (reserva `kind 'extract'`: open → IA → settle;
  qualquer falha → reverse; sem `free_extraction_used`; `pdf_uploads.was_free` = mode exempt),
  `supabase/functions/chat/index.ts` (trata `exempt`)
- Modify: `supabase/functions/_shared/adminDashboard.ts` (+`access_kind`, `plan_credits`,
  `plan_period_end`, `trial_started_at`, `cpf` mascarado), `admin-dashboard/index.ts` (select novo)
- Create: `supabase/functions/admin-set-access/index.ts` + `_shared/adminSetAccess.ts` (+test):
  body `{ userId, kind: 'legacy'|'trial'|'exempt' }` ou `{ userId, extendDays: 7|14|30 }`;
  `authorizeSuperAdmin`; registra em `admin_actions`? (tabela é da Fase 5: aqui só `console.info`).

- [x] **RED:** testes dos módulos puros (exempt em `chargeCredits`/`interpretReservation`;
  `mergeUserRows` com as colunas novas e CPF `***.***.***-09`; `validateSetAccessInput`).
- [x] **GREEN:** implementar; `npx vitest run supabase/functions`; `denoImportGraph` verde.
- [x] Commit `feat(credits): edge functions consomem pelos dois baldes e extração vira reserva`.

---

### Task 6: `computeAccess` e estado no cliente

**Files:**
- Create: `src/lib/domain/access.ts` (+test)
- Modify: `src/contexts/AuthContext.tsx` (+`profileLoading`, `fetchProfile` adiado no listener), test

```ts
export type AccessKind = "subscriber" | "trial" | "exempt" | "legacy";
export interface AccessProfile { access_kind: string; plan_credits: number; plan_period_end: string | null;
  credit_balance: number; trial_started_at: string | null; must_set_password: boolean; }
export interface Access { kind: AccessKind; planCredits: number; extraCredits: number; total: number;
  unlimited: boolean; paywalled: boolean; periodEnd: Date | null; daysLeft: number | null;
  trialExpired: boolean; }
export function computeAccess(profile: AccessProfile | null, now: Date): Access | null;
// plano conta só se periodEnd > now; unlimited = exempt; paywalled = !unlimited && total === 0;
// daysLeft = ceil((periodEnd - now)/dia) quando kind = trial e periodEnd > now; trialExpired = trial e periodEnd <= now.
export function parseIsoOrNull(value: string | null | undefined): Date | null;  // sem depender de narrowing
export function canAfford(access: Access | null, cost: number): boolean;
```
Hook `useAccess()` em `src/hooks/useAccess.ts` (usa `useAuth().profile` + `Date`).

- [x] **RED/GREEN** com todos os ramos. Commit `feat(credits): calcular o estado de acesso no cliente`.

---

### Task 7: UI: saldo total, faixa de estado, paywall e fim do "grátis"

**Files:**
- Modify: `src/components/common/Layout.tsx` (badge = `access.total`; faixa `role="status"`:
  trial dias restantes / trial expirado / paywall com CTA `/creditos`), test
- Modify: `src/components/adaptation/steps/generate/StepGenerate.tsx` (402 → mensagem + botão
  "Comprar créditos" já existe; texto "Seus créditos acabaram."), test
- Modify: `src/components/adaptation/steps/barriers/StepBarrierSelection.tsx` (remove o ramo
  "Grátis"; mostra custo e `canAfford`), test
- Modify: `src/pages/QuestionBankPage.tsx` (`canExtract = canAfford(access, 5)`; sem "Extração
  gratuita"), test
- Modify: `src/pages/CreditsPage.tsx` (hero com "Créditos do plano · até dd/mm" e "Créditos extras";
  `TYPE_LABELS` novos: `trial_grant` "Créditos do teste", `plan_grant` "Créditos do plano",
  `plan_reset` "Créditos do plano encerrados", `compensation` "Compensação", `clawback` "Estorno de
  plano", `admin_grant` já existe), test
- Modify: `src/pages/DashboardPage.tsx` ("Comprar" → "Ver créditos"), `src/pages/MyAdaptationsPage.tsx`
  e `src/pages/AdaptacoesPage.tsx` ("Gratuita" → "Sem débito"), tests
- Modify: `src/pages/AuthPage.tsx` (só login; `?signup=1` → aviso "O cadastro é feito pela
  assinatura ou por convite."; remove view "Verifique seu e-mail"), `src/lib/utils/errors.ts`
  (`parseAuthError` só `login`), tests; `src/components/landing/*` CTAs "Começar grátis" →
  "Entrar" (`/auth`), `LandingFooter` sem "Criar conta", `PricingSection` "Comprar" → `/auth`
  (copy completa fica para a Fase 4), tests
- Modify: `supabase/config.toml` (`[auth] enable_signup = false`)

- [x] **RED/GREEN** por arquivo. Commit `feat(credits): paywall suave, saldo por balde e fim do cadastro público`.

---

### Task 8: Admin: leitura dos estados e "Alterar acesso"

**Files:**
- Modify: `src/types/admin.ts`, `src/hooks/useAdminDashboard.ts` (+`useSetAccess`),
  `src/components/admin/UsersTable.tsx` (badge de acesso: Assinante/Teste até dd/mm/Cortesia/Legado;
  colunas Plano e Extras; filtro por estado; menu "Alterar acesso" com opções e "Estender teste"
  7/14/30), tests

- [x] **RED/GREEN.** Commit `feat(admin): mostrar o estado de acesso e permitir alterá-lo`.

---

### Task 9: docs vivas + validação

- [x] `dominio-orientador` (gotchas: dois baldes, `consume_credits`, trial por confirmação, fim das
  flags), `edge-fn-writer` (árvore), `environment.md` se necessário.
- [x] `make lint`, `npx vitest run`, `npm run test:coverage` (100%), `make test-db`, `make fn-check`
  (sem erros novos além dos 15 conhecidos).
- [x] Commit `docs(skills): dois baldes de crédito, trial por confirmação e acesso pelo admin`.
