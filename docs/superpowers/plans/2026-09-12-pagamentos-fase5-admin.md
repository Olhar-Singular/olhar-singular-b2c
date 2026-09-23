# Fase 5: admin (criar usuário por convite, alterar e-mail, assinaturas, auditoria)

Spec: `docs/superpowers/specs/2026-09-11-pagamentos-assinatura-mp-design.md` (decisão 28, fluxo I,
seção 4.6, seção 9 "Convite do admin"). Estado ao final: **o super-admin cria contas Trial/Cortesia
por convite, corrige e-mail, vê e cancela assinaturas, e tudo fica registrado em `admin_actions`.**

## Global Constraints

- Branch `redesign/assinatura-mp`; commits sem push. Zero deploy.
- `admin_actions.payload` nunca leva e-mail nem CPF (só ids, ação, valores).
- Toda `admin-*` function passa por `authorizeSuperAdmin`; ações com `userId` no body idem.

## Task 1: `admin_actions`

Migration `20260916000000_admin_actions.sql`: tabela (`id, actor_id, target_user_id, action,
payload jsonb, created_at`), RLS sem policy (só `service_role`), índice `(target_user_id,
created_at)`, RPC `log_admin_action(actor, target, action, payload)`. pgTAP `admin_actions.test.sql`.

## Task 2: módulos puros + functions

- `_shared/adminAudit.ts`: `sanitizeAuditPayload` (remove chaves com e-mail/cpf/senha) +
  `logAdminAction(client, entry)` (RPC, nunca lança: loga e segue).
- `_shared/adminCreateUser.ts`: `validateCreateUserInput({ email, fullName, mode })` (mode
  `trial | exempt`), `inviteRedirect(appUrl)` = `${appUrl}/redefinir-senha?convite=1`.
- `_shared/adminChangeEmail.ts`: `validateChangeEmailInput({ userId, email })`.
- `admin-create-user/index.ts`: `auth.admin.inviteUserByEmail(email, { data: { full_name,
  access_kind: mode }, redirectTo })` (o `handle_new_user` lê `access_kind`; o trial começa quando
  o convite é aceito) → `email_exists` 409 → audit.
- `admin-change-email/index.ts`: `updateUserById(userId, { email, email_confirm: true })` → audit.
- Auditoria nas existentes: `admin-user-status`, `admin-grant-credits`, `admin-set-access`,
  `cancel-subscription` (ramo admin).
- `admin-dashboard`: por usuário `subscription { status, plan_name, price_brl, next_payment_date,
  mp_preapproval_id }`; `subscriptions { by_status, mrr_brl }` (`mergeUserRows` + `summarizeSubscriptions`).

## Task 3: cliente

- `types/admin.ts`: `AdminSubscription`, `AdminSubscriptionSummary`, `CreateUserInput`,
  `ChangeEmailInput`; `useAdminDashboard.ts`: `useCreateUser`, `useChangeEmail`,
  `useAdminCancelSubscription` (invoca `cancel-subscription` com `{ userId }`).
- `components/admin/CreateUserDialog.tsx` (e-mail, nome, Trial/Cortesia).
- `AccessMenu`: "Alterar e-mail" (diálogo) e "Cancelar assinatura" (confirmação) quando há
  assinatura viva.
- `UsersTable`: coluna "Assinatura" (status + plano + próxima cobrança); filtro ganha
  `past_due` ("Inadimplente").
- `AdminPage`: abas **Usuários**, **Assinaturas e receita** (`SubscriptionStats`: contagens por
  status + MRR), **Custos de IA** (StatCards + CostChart atuais).

## Task 4: docs vivas + validação

`dominio-orientador` (Admin), `edge-fn-writer` (árvore), `rls-policy-writer` se aplicável;
`make lint`, coverage 100%, `make test-db`, `make fn-check`; `make gen-types`.

## Estado (2026-09-12)

Tasks 1 a 4 concluídas: `7c9e48a` (admin_actions), `882097f` (functions + auditoria + dashboard)
e o commit do cliente (CreateUserDialog, AccessMenu com e-mail e cancelamento, coluna Assinatura,
SubscriptionStats, abas). Pendente: validação no browser.
