# Página de Superadmin — Design

**Data:** 2026-06-01
**Status:** Aprovado, em implementação autônoma (TDD, cobertura 100%).

## Objetivo

Página exclusiva de superadmin para gerenciar usuários da plataforma B2C: listar,
ativar/inativar, ver o gasto (custo real em USD com IA) por usuário e o gasto agregado
da plataforma (total, hoje, mês, séries diária/mensal), além de nome, e-mail e último acesso.

## Decisões (confirmadas com o usuário)

- **Gasto = custo real em USD** somado de `ai_usage_logs.cost_total` (não créditos, não receita R$).
- **Acesso** controlado por nova coluna booleana `profiles.is_super_admin`.
- **Desativar = ban nativo do Supabase Auth** (`auth.admin.updateUserById` com `ban_duration`); a UI lê `banned_until`.
- **Último acesso = `auth.users.last_sign_in_at`** (rastreado nativamente).
- **Arquitetura = Edge Functions `service_role`** (toda leitura/escrita admin passa por funções verificadas).
- **Gráficos = recharts** (via componente `chart` do shadcn em `src/components/ui/`).

## Por que edge functions com service_role

`email`, `last_sign_in_at` e o estado de ban vivem em `auth.users`, inacessível ao client do
navegador. Logo já existe um caminho privilegiado obrigatório. Funilar tudo por funções
`admin-*` que validam o JWT e conferem `is_super_admin` no servidor é o mais seguro e
consistente com o projeto (`check-and-deduct-credits`, `mp-webhook`, `create-checkout`).

## Modelo de dados (migration `20260601000000_superadmin.sql`)

- `ALTER TABLE public.profiles ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false`.
- **Trigger anti-escalação** `BEFORE UPDATE`: bloqueia mudança de `is_super_admin` quando o
  papel do request (claims JWT) é `authenticated`/`anon`. Permite `service_role` e `postgres`
  (SQL editor) — é assim que o primeiro admin é criado.
- **RPCs** (executáveis só por `service_role`; `REVOKE ... FROM PUBLIC`):
  - `admin_cost_summary()` → `(total_usd, today_usd, month_usd)`.
  - `admin_cost_series(p_granularity, p_buckets)` → série temporal somada (valida `day|month`).
  - `admin_user_spending()` → `(user_id, total_usd, last_action)` por usuário.
- Índice `idx_ai_usage_logs_created_at`.

## Backend — Edge Functions

Lógica testável extraída para `supabase/functions/_shared/` (coberta por testes):

- `adminAuth.ts` → `authorizeSuperAdmin(client, authHeader)`: valida JWT + confere `is_super_admin`.
  Retorna `{ ok, userId }` ou `{ ok:false, status, error }`.
- `adminDashboard.ts` → `isUserActive(bannedUntil, now)`, `mergeUserRows(...)`, `shapeSeries(rows)`.
- `adminUserStatus.ts` → `validateStatusInput(body, callerId)`, `banDurationFor(action)`.

`index.ts` finos (glue HTTP, excluídos da cobertura, padrão do projeto):

- `admin-dashboard` (leitura): autoriza → `auth.admin.listUsers` (paginado) + RPCs → `{ metrics, users }`.
- `admin-user-status` (escrita): autoriza → valida → `auth.admin.updateUserById(ban_duration)`.
  Impede o admin de banir a si mesmo.

## Frontend

- `gen-types` adiciona `is_super_admin` ao tipo `profiles` → disponível via `AuthContext`.
- `src/types/admin.ts`: interfaces `AdminMetrics`, `AdminUser`, `AdminDashboardData`.
- `src/lib/utils/adminFormat.ts`: `formatUsd`, `formatLastAccess` (date-fns ptBR).
- `src/hooks/useAdminDashboard.ts`: `useAdminDashboard()` (query `["admin","dashboard"]`, staleTime 60s)
  e `useSetUserStatus()` (mutation → invalida + toast).
- `src/components/common/SuperAdminRoute.tsx`: sem `is_super_admin` → `Navigate` para `/dashboard`.
- `src/components/admin/`: `StatCards`, `CostChart` (toggle Diário/Mensal), `UsersTable`
  (busca por nome/e-mail, ordenação por gasto, `Switch` + `AlertDialog` de confirmação ao inativar).
- `src/pages/AdminPage.tsx`: compõe os três; loading/erro/empty.
- `Layout.tsx`: item de nav "Admin" condicional a `profile?.is_super_admin`.
- `App.tsx`: rota `/admin` dentro do Layout, embrulhada por `SuperAdminRoute`.
- Moeda exibida em USD (`$`); sem conversão R$ (sem taxa de câmbio confiável).

## Segurança

Trigger anti-escalação · RPCs revogadas de PUBLIC · edge functions re-verificam `is_super_admin`
no servidor (gate no client é só UX) · admin não bana a si mesmo · `auth.users` nunca exposto ao client.

## Testes (TDD Red→Green→Refactor, cobertura 100%)

- `_shared/*` admin: testados sob Vitest (helpers parametrizados por client mockado).
- Frontend: hooks, `SuperAdminRoute`, componentes `admin/*`, `AdminPage`, nav condicional do Layout,
  rota no App. `CostChart` mocka `recharts` e `@/components/ui/chart`.
- `index.ts` das edge functions e `types.ts` ficam fora da cobertura (config do vitest).
- Migration validada via `supabase db reset` local + `gen-types`.

## Fora de escopo (YAGNI)

Edição de créditos, impersonation, gestão de papéis na UI, conversão R$, export CSV,
paginação server-side (entram quando a base crescer).

## Passos manuais pós-merge (ambiente, fora do código)

1. `make db-push` (após `migration-reviewer`) e `make fn-deploy-all`.
2. Promover o primeiro admin: `update public.profiles set is_super_admin = true where id = '<uuid>'`
   (rodar como `postgres`/service_role no SQL editor).
