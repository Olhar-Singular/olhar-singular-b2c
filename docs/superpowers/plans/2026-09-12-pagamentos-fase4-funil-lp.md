# Fase 4: funil da landing (pagar primeiro, depois a conta)

Spec: `docs/superpowers/specs/2026-09-11-pagamentos-assinatura-mp-design.md` (decisões 12 a 16,
fluxos A e J, seções 4.5, 4.8 e 9). Estado ao final: **visitante anônimo escolhe um plano na LP,
paga com cartão em `/assinar`, a conta nasce, ele entra logado e define a senha.**

## Global Constraints

- Branch `redesign/assinatura-mp`; commits sem push. Zero deploy, zero secret remoto.
- Sessão **só com pagamento**: `sessionTokenHash` volta apenas quando a conta foi criada agora E
  o preapproval voltou `authorized`/`pending`. Recusa com conta nova → `signInWithOtp` (prova de
  posse do e-mail). Nunca ecoar body, nunca logar `payer`/CPF/senha.
- `access_kind` não é escrito pelo `subscribe`: só `activate_subscription` promove a `subscriber`.
  `cpf`/`terms_*` gravados só após `authorized`/`pending`.
- Host público: `https://professor.olharsingular.com` (decisão 27: sempre `.com`).

## Task 1: schema `checkout_attempts`

`supabase/migrations/20260915000000_checkout_attempts.sql`: tabela `checkout_attempts(id, ip_hash,
email_hash, outcome text, created_at)` sem policy (RLS on, só `service_role`), índice em
`created_at`; RPC `record_checkout_attempt(ip_hash, email_hash, outcome)` que insere, purga > 24h e
devolve contagens `{ by_email_1h, by_ip_1h, rejected_10m }`. pgTAP `checkout_attempts.test.sql`.

## Task 2: `_shared/checkoutGuard.ts` + `_shared/accountProvision.ts`

- `normalizeEmail` (minúsculas; gmail sem pontos e sem `+tag`), `hashIdentifier(value, secret)`
  (HMAC-SHA256 via WebCrypto, hex), `clientIp(headers)` (1º item de `x-forwarded-for`),
  `decideCheckoutAccess(counts, limits)` → `allow | rate_limited (429) | circuit_open (503)`.
- `isValidCpf(digits)`, `parseAccountInput(body)` → `{ fullName, email, termsVersion }`,
  `parseCpf(card.payer)`.
- `runAnonymousCheckout(input, deps)`: guarda → resolve usuário (JWT válido ⇒ logado; senão
  `createUser` com senha aleatória, `email_confirm: true`, `must_set_password = true`;
  `email_exists` ⇒ 409) → `runSubscribe` → pós: `cpf`/`terms` se `authorized|pending`; magic
  link só se `accountCreated && status !== 'rejected'`; registra a tentativa.

## Task 3: `subscribe/index.ts` público + `set-initial-password`

- `config.toml` `[functions.subscribe] verify_jwt = false`; Authorization opcional.
- `set-initial-password` (+`_shared/setInitialPassword.ts`): mínimo 6, `updateUserById`,
  `must_set_password = false`, `auth.admin.signOut(jwt, 'others')`.

## Task 4: cliente

- `SubscribePage`: modo anônimo (nome, e-mail com passo "confira seu e-mail", aceite dos termos,
  Brick montado só depois, `key={email}`); resposta → `verifyOtp({ token_hash, type: 'magiclink' })`
  → `/definir-senha`; recusa com conta criada → `signInWithOtp` + tela "confira seu e-mail".
- `SubscribeRoute` em `App.tsx`: com sessão renderiza dentro do `Layout`; sem sessão, casca
  pública (`AuthLayout`).
- `SetPasswordPage` (`/definir-senha`, protegida, fora do Layout, botão Sair); `ProtectedRoute`
  força a rota enquanto `must_set_password` (aguarda `profileLoading`).
- `AuthPage` `?signup=1` → `/assinar`. `ResetPasswordPage` `?convite=1` → copy "Crie sua senha".

## Task 5: LP, legal, SEO, convite

- `LandingHeader` "Entrar" + "Assinar"; `HeroSection` CTA para `/assinar`; `FaqSection` reescrita;
  CTA final "Assinar agora"; `LandingFooter` com Termos/Privacidade/Reembolso.
- Páginas `/termos`, `/privacidade`, `/reembolso` (rascunho marcado).
- `index.html` (título, description, og/twitter, canonical), `robots.txt`, `sitemap.xml`.
- `supabase/templates/invite.html` + `[auth.email.template.invite]`.
- Teste de guarda: grep em `src/**/*.tsx` por `grátis|gratuit|nunca expiram|Stripe`.

## Task 6: docs vivas + validação

`dominio-orientador`, `edge-fn-writer`, `environment.md`, `.env.example` (`CHECKOUT_HASH_SECRET`),
`make lint`, coverage 100%, `make test-db`, `make fn-check`.
