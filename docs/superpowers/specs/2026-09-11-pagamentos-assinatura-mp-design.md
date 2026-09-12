# Pagamentos: assinatura mensal via Mercado Pago, cartão inline, funil pagar-primeiro e analytics (Design)

**Data:** 2026-09-11 · **Status:** aprovado (decisões fechadas em conversa em 2026-09-11; o dono
autorizou implementação autônoma sem deploy) · **Escopo:** Créditos, Auth, Landing, Admin, edge
functions, RPCs, CI/infra local.

## 1. Objetivo

Trocar o modelo de monetização e o provedor de cartão:

1. **Remover a Stripe.** Cartão passa a ser Mercado Pago (MP), inline na nossa página (Card Payment
   Brick tokeniza no browser; o backend cria o pagamento ou a assinatura com o token). Pix já é MP
   Checkout Transparente e continua igual.
2. **Assinatura mensal** (MP Assinaturas, `POST /preapproval` com `card_token_id`) que repõe
   créditos todo mês, **mantendo créditos extras avulsos** (Pix ou cartão) que nunca expiram.
3. **Funil invertido na landing:** o visitante paga primeiro (nome + e-mail + cartão numa tela), a
   conta nasce no checkout, e ele cai **dentro do app já logado**, com a tela "defina sua senha".
4. **Fim do cadastro público grátis.** Trial (7 dias, 50 créditos) e Cortesia (sem cobrança) só
   existem para usuários **criados pelo admin**.
5. **Paywall suave** quando não há crédito (plano + extras = 0) e não há isenção: leitura, edição e
   PDF continuam; adaptar, extrair e chat bloqueiam com CTA para assinar ou comprar extras.
6. **Analytics de pagamento**: GTM + GA4 no cliente, Meta Pixel via GTM, e eventos server-side
   (GA4 Measurement Protocol + Meta Conversions API) disparados pelos webhooks e pelo checkout.

## 2. Decisões (com o dono, 2026-09-11)

### Modelo comercial

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Avulso continua após o trial? | Sim. Extras via Pix **e** cartão inline. Assinatura serve só para repor créditos mensais. |
| 2 | Planos mensais | Básico R$19,90 (60 créditos/mês), Profissional R$59,90 (240/mês, "Popular"), Avançado R$99,90 (500/mês). Curva de 3, 4 e 5 créditos por real, derivada dos pacotes atuais. |
| 3 | Pacotes extras | Mantidos: 30 por R$9,90, 120 por R$29,90, 300 por R$59,90. Vivem em tabela para mudar sem código. **Risco registrado:** a R$59,90 o avulso (300, sem validade) rende mais que o plano Profissional (240, mensal). |
| 4 | Renovação | Zera e recarrega a cota. Nunca acumula. |
| 5 | Créditos do trial | Morrem no fim dos 7 dias. Assinar durante o trial substitui o saldo pela cota do plano, sem somar. |
| 6 | Flags "1ª adaptação grátis" e "1ª extração grátis" | Aposentadas. Quem ainda tem a flag disponível recebe 12 créditos extras de compensação na migração (9 usuários em produção). |
| 7 | Usuários existentes | Saldo atual vira extras sem validade (`credit_balance`), sem trial novo. Paywall só quando zerar. Estado `legacy`. |
| 8 | Relógio do trial | Começa na **confirmação do e-mail** (`email_confirmed_at`), não no INSERT. |
| 9 | Bloqueio pós-trial | **Paywall suave.** Leitura, edição e PDF liberados; adaptar, extrair e chat bloqueiam. Ban do Auth fica só como ação disciplinar do admin. |
| 10 | Falha na renovação | Seguir o MP: enquanto ele retenta (`recycling`), créditos do ciclo ficam congelados e o estado é `past_due`. Quando o MP cancela, `cancelled`. |
| 11 | Plano anual | Não existe. Só mensal. |

### Funil da landing (pagar primeiro)

| # | Decisão | Escolha |
|---|---------|---------|
| 12 | Campos do checkout | Nome + e-mail + cartão (Brick, com CPF do titular). Conta criada com **senha aleatória**; no 1º acesso o app obriga a definir senha. Sessão criada via magic link gerado no servidor e trocado por `verifyOtp` no cliente, sem e-mail. |
| 13 | Confirmação de e-mail para quem paga | Não. Cartão aprovado é a prova (`email_confirm: true`). Campo de e-mail com etapa de revisão antes de pagar. O comprovante de pagamento é o do MP (nada via Resend na v1). |
| 14 | Cartão recusado depois da conta criada | Manter a conta, logar e mostrar "pagamento recusado, tente outro cartão". Sem trial: fica no paywall com a assinatura para tentar de novo dentro do app. |
| 15 | Cadastro público grátis | **Não existe.** Signup desligado no servidor. Admin cria usuários em dois modos: **Trial** (7 dias, 50 créditos, depois paywall) ou **Cortesia** (isento, sem prazo). Quem paga na LP nunca passa por trial. |
| 16 | Onde fica o checkout | Rota própria `/assinar?plano=<slug>`. Funciona anônimo (cria conta) e logado (só cartão). |
| 17 | Login com Google | Fora do escopo. Provider segue sem UI. |

### Assinatura Mercado Pago

| # | Decisão | Escolha |
|---|---------|---------|
| 18 | Meio da assinatura | Só cartão. Pix fica para extras. |
| 19 | Primeira cobrança | O MP cobra a 1ª parcela de forma assíncrona (até ~1h). Liberamos o plano **ao criar a assinatura autorizada** (otimista) e revertemos pelo webhook se a 1ª parcela falhar. |
| 20 | Cancelamento pelo usuário | Sim, self-service em `/creditos`. Acesso e créditos do ciclo até o fim do período pago. |
| 21 | Troca de plano e de cartão | Só troca de cartão. Upgrade/downgrade = cancelar e assinar de novo (dito na FAQ). |
| 22 | Parcelamento | Não. 1x fixo. |
| 23 | Descritor na fatura | `OLHAR SINGULAR`. |
| 24 | CPF | Coletado pelo Brick, repassado ao MP e **gravado** em `profiles.cpf`. Exibido na plataforma, não editável pelo usuário, sem regra de negócio por enquanto. |

### Analytics, legal e admin

| # | Decisão | Escolha |
|---|---------|---------|
| 25 | Stack | GTM + GA4 no cliente; Meta Pixel via GTM; Measurement Protocol e Conversions API nos webhooks. IDs ainda não existem: tudo é no-op sem eles. |
| 26 | Consentimento LGPD | Banner com Consent Mode v2 (tudo `denied` até aceitar). |
| 27 | Domínio | Sempre `olharsingular.com`. |
| 28 | Admin nesta rodada | Leitura completa + criar usuário (Trial/Cortesia) + estender trial + cancelar assinatura + dar créditos extras. Reembolso manual no painel do MP. |
| 29 | Stripe | Apagar functions do remoto e revogar chaves; conta aberta 6 meses por disputas. |
| 30 | Smoke real | Pacote de teste R$1 (extras, cartão MP e Pix) e plano de teste R$1/mês, ambos só para super-admin. |

## 3. Estado verificado em 2026-09-11 (produção)

- **MP:** aplicação "PROFESSOR OLHAR SINGULAR" (produção) tem escopos de Assinaturas e de pagamento
  com cartão; `GET /preapproval/search` responde 200. Meios: pix, visa, master, amex, elo, debelo,
  boleto. A seção STAGING do `.env` é um **usuário de teste vendedor** com aplicação própria e os
  mesmos escopos; sandbox não tem Pix. A aplicação de produção reporta `sandbox_mode: true` (a
  conferir no painel). Tópicos do webhook só se configuram no painel.
- **Supabase remoto:** secrets `ACCESS_TOKEN_MP_PROD`, `VERIFY_TOKEN_MP_PROD`, `APP_URL`,
  `AI_API_KEY`, `STRIPE_*`, `ACCESS_TOKEN_MP` (antigo). 13 functions publicadas, incluindo órfãs
  (`check-and-deduct-credits`, `regenerate-question`) e as duas da Stripe. Auth: signup **ligado**,
  confirmação ligada, anônimos desligados, Google ligado sem UI, senha mínima 6, SMTP Resend ok.
  Bundle em produção usa `sb_publishable_` (não é JWT). **pg_cron não instalado**, nenhum job.
- **Dados:** 18 usuários, 2 super-admins, 903 créditos, 9 com `free_adaptation_used = false`,
  2 e-mails não confirmados, 3 banidos, 7 reservas `settled`. Compras presas: 16 Pix `pending`,
  12 Stripe `pending`.
- **Stripe live:** zero webhooks cadastrados; 2 pagamentos `succeeded` e só 1 compra `approved` no
  banco (provável cliente não creditado, listar na migração); 2 sessões abertas; 0 disputas.
- **Site:** CSP atual bloqueia MP, GTM e Meta. Sem tag de analytics. `olharsingular.com.br` dá 522
  e `sitemap.xml`/`robots.txt` apontam para ele. Título do `index.html` é "Orientador Digital B2C".
- **Resend:** domínio `olharsingular.com` verificado (DKIM/SPF ok). **GitHub:** CLI autenticado.

## 4. Arquitetura

### 4.1 Modelo de dados

Migrations novas em `supabase/migrations/` (uma por tema, todas idempotentes, `CREATE OR REPLACE`
nas funções que já têm REVOKE):

**`plans`** (fonte única dos planos; lida pela LP anônima e validada pelo backend)

| coluna | tipo | nota |
|--------|------|------|
| id | uuid pk | |
| slug | text unique | `basico`, `profissional`, `avancado`, `teste-admin` |
| name | text | |
| price_brl | numeric(10,2) | |
| monthly_credits | integer | |
| highlight | boolean | "Popular" |
| sort_order | integer | |
| active | boolean | |
| admin_only | boolean | plano de teste R$1/mês |
| created_at, updated_at | timestamptz | |

RLS: `SELECT` para `anon` e `authenticated` onde `active = true` e (`admin_only = false` ou o
chamador é super-admin via `EXISTS (select 1 from profiles where id = auth.uid() and is_super_admin)`).
Escrita só `service_role`. Seed na própria migration (não há `seed.sql` e o CI só roda `db push`).

**`credit_packages`** (extras avulsos; substitui `ALLOWED_PACKAGES`/`TEST_PACKAGE` hardcoded)

`id, credits, price_brl, label, sort_order, active, admin_only`. Mesma RLS de `plans`. Seed:
30/9,90 "Básico", 120/29,90 "Profissional" (highlight), 300/59,90 "Avançado", 1/1,00 "Teste (admin)"
com `admin_only = true`. `findPackage` vira função pura sobre as linhas carregadas (continua
testável) e os checkouts consultam a tabela via service_role.

**`profiles`** (colunas novas; todas entram em `prevent_credit_self_mutation`)

| coluna | tipo | nota |
|--------|------|------|
| plan_credits | integer not null default 0 | balde mensal; também guarda os créditos do trial |
| plan_period_end | timestamptz | validade do balde; `NULL` = sem balde ativo |
| access_kind | text not null default 'subscriber' | `subscriber` · `trial` · `exempt` · `legacy` |
| cpf | text | só dígitos; gravado pelo checkout; nunca editável por `authenticated` |
| must_set_password | boolean not null default false | ligado pelo checkout; desligado por `set-initial-password` |

`credit_balance` passa a ser o balde **extras** (nunca expira). `DEFAULT` cai para **0** (fim do
bônus de cadastro). `free_adaptation_used`/`free_extraction_used` ficam no schema por um ciclo
mas nada mais as lê (drop em migration futura).

**`subscriptions`** (espelho local do preapproval do MP)

| coluna | tipo | nota |
|--------|------|------|
| id | uuid pk | = `external_reference` do preapproval |
| user_id | uuid fk auth.users | índice único parcial: uma assinatura "viva" por usuário (`status in ('pending','authorized','past_due','paused')`) |
| plan_id | uuid fk plans | |
| mp_preapproval_id | text unique | |
| status | text check | `pending` · `authorized` · `past_due` · `paused` · `cancelled` · `rejected` |
| mp_status | text | status cru do MP |
| next_payment_date | timestamptz | do MP |
| current_period_end | timestamptz | = `plan_period_end` do usuário enquanto ativa |
| payer_email | text | |
| card_brand, card_last_four | text | do MP quando disponível; nunca token |
| attribution | jsonb | utm_*, gclid, fbclid, ga_client_id, fbp, fbc, referrer, landing_path, consent |
| cancel_requested_at, cancelled_at | timestamptz | |
| created_at, updated_at | timestamptz | |

RLS: dono lê (`SELECT` `auth.uid() = user_id`); escrita só `service_role`.

**`subscription_invoices`** (uma linha por `authorized_payment`; chave de idempotência da renovação)

`id text pk` (id do authorized_payment no MP), `subscription_id fk`, `mp_payment_id text`,
`status text`, `amount_brl numeric`, `debit_date timestamptz`, `retry_attempt integer`,
`raw jsonb`, `created_at`. Dono lê; escrita `service_role`.

**`credit_transactions`** (ledger): coluna `bucket text not null default 'extra'`
check `('plan','extra','exempt')`; `type` ganha `trial_grant`, `plan_grant`, `plan_reset`,
`compensation`, `clawback`. Toda movimentação de qualquer balde gera linha, inclusive o reset
(`plan_reset` com delta negativo do que sobrou + `plan_grant` com a cota nova) e o uso isento
(`delta 0`, `bucket exempt`), para o extrato explicar o saldo.

**`credit_reservations`**: `plan_charged integer default 0`, `extra_charged integer default 0`
(`credits_charged` continua = soma). Estorno volta ao balde de origem.

**`credit_purchases`**: `DEFAULT provider = 'mercadopago'` (CHECK mantém `'stripe'` pelo
histórico); `attribution jsonb`; `status_detail text` (detalhe do MP em recusas).

**`admin_actions`**: `id, actor_id, target_user_id, action text, payload jsonb, created_at`.
`service_role` only. Escrita por toda `admin-*` function nova (criar usuário, estender trial,
cancelar assinatura) e pelas existentes (ban, grant).

**`checkout_attempts`**: `id, ip_hash text, email_hash text, created_at`. Rate limit do endpoint
público (máx. 5 tentativas por e-mail e 10 por IP em 1h). `service_role` only, índice em
`created_at`.

### 4.2 Regras de crédito (RPCs, todas `SECURITY DEFINER`, `service_role` only)

- **`consume_credits(p_user_id, p_amount, p_type, p_ref_id) → jsonb`** (nova, o coração):
  `FOR UPDATE` no perfil; se `access_kind = 'exempt'` → ledger `delta 0 / bucket exempt`, retorna
  `mode 'exempt'`; senão `plan_available = plan_credits` se `plan_period_end > now()` senão 0;
  se `plan_available + credit_balance < p_amount` → `{success:false, error:'insufficient_credits',
  plan_balance, extra_balance, balance}`; senão debita **plano primeiro, extras depois**, grava uma
  linha de ledger por balde tocado e retorna `{success, mode:'charged', plan_charged, extra_charged,
  plan_balance, extra_balance, new_balance}` (`new_balance` = total, para compatibilidade).
- **`deduct_credits(uuid,int,text,uuid)`** vira wrapper de `consume_credits` (mesma assinatura,
  `CREATE OR REPLACE`, ACL preservada). `chat` e `extract-questions` passam a funcionar sem mudança
  de contrato; `extract-questions` perde a pré-checagem de `free_extraction_used`.
- **`open_adapt_reservation`**: sem free-first; chama `consume_credits`; grava
  `plan_charged/extra_charged`; `mode` ∈ `charged | exempt`.
- **`reverse_credit_reservation`**: devolve `plan_charged` ao balde do plano se
  `plan_period_end > now()`, senão aos extras; `extra_charged` aos extras. Ledger `refund` por balde.
- **`grant_credits`**: inalterada (extras). **`admin_grant_credits`**: inalterada (extras).
- **`activate_subscription(p_user_id, p_subscription_id, p_period_end)`** e
  **`renew_subscription(p_subscription_id, p_invoice_id, p_period_end)`**: `access_kind =
  'subscriber'`, `plan_credits = monthly_credits` do plano (reset, nunca soma), `plan_period_end =
  p_period_end`, `subscriptions.status = 'authorized'`, ledger `plan_reset` (se sobrou) +
  `plan_grant`. `renew_*` insere em `subscription_invoices` primeiro; conflito de pk → retorna
  `already_processed` sem tocar saldo.
- **`mark_subscription_past_due(p_subscription_id)`** e **`cancel_subscription_local(...)`**:
  só mudam status; créditos do ciclo ficam até `plan_period_end` (expiração é **lazy**, por
  comparação de data em `consume_credits` e no cliente). Sem dependência de pg_cron.
- **`start_trial_on_confirm()`** (trigger `AFTER UPDATE OF email_confirmed_at ON auth.users` e
  também dentro de `handle_new_user` quando o INSERT já vem confirmado): se
  `access_kind = 'trial'` e `plan_period_end IS NULL` → `plan_credits = 50`,
  `plan_period_end = now() + interval '7 days'`, ledger `trial_grant`. Função revogada de
  `anon/authenticated` (padrão da migration 20260816) e coberta em `function_hardening.test.sql`.
- **`admin_extend_trial(p_user_id, p_days)`**: só `access_kind = 'trial'`; `plan_period_end =
  greatest(now(), coalesce(plan_period_end, now())) + p_days`; presets 7/14/30; teto de 90 dias
  acumulados desde a criação.
- **Migração de dados (uma migration):** `access_kind = 'legacy'` para todos os perfis
  existentes; `+12` extras (`compensation`) para quem tem `free_adaptation_used = false`; fechar
  `credit_purchases` `pending` como `cancelled` (Pix e Stripe); relatório (`RAISE NOTICE`) dos
  `payment_id` Stripe aprovados sem grant para conferência manual.

### 4.3 Fluxos

**A. Assinar na landing (`/assinar?plano=<slug>`)**

```
SubscribePage (público)
  ├─ lê plans via usePlans (SELECT anon)
  ├─ campos: nome, e-mail (com passo "confira seu e-mail"), aceite dos termos (versão + ts)
  ├─ MpCardBrick (amount = price, payer.email pré-preenchido, maxInstallments 1, coleta CPF)
  └─ onSubmit(formData) → invoke("subscribe", { plan_slug, card: formData, account, attribution, consent })
edge `subscribe` (verify_jwt = false; aceita Authorization opcional)
  1. rate limit (checkout_attempts) → 429
  2. plan = plans[slug] ativo (admin_only só para super-admin autenticado) → 400
  3. usuário:
     a. Authorization válido → usa esse usuário (fluxo logado; ignora `account`)
     b. senão auth.admin.createUser({ email, password: random(32), email_confirm: true,
        user_metadata: { full_name } }) → em 'email_exists' → 409 { error: 'email_exists' }
        (a UI oferece login inline e refaz como fluxo logado)
     c. profiles: cpf, must_set_password = true, access_kind = 'subscriber'
  4. insert subscriptions (status 'pending', attribution)
  5. POST /preapproval { reason: `Assinatura ${plan.name} - Olhar Singular`,
       external_reference: subscription.id, payer_email, card_token_id: card.token,
       auto_recurring: { frequency: 1, frequency_type: 'months',
                         transaction_amount: price, currency_id: 'BRL' },
       back_url: `${APP_URL}/creditos`, status: 'authorized' }
     header X-Idempotency-Key = subscription.id
     ├─ 2xx e status 'authorized' → update subscriptions (mp id, mp_status, next_payment_date)
     │     → RPC activate_subscription(period_end = next_payment_date ?? now()+1 month)
     │     → analytics server: subscription_started
     └─ erro/recusa → subscriptions.status = 'rejected' + status_detail; usuário fica (decisão 14)
  6. se o usuário foi criado agora: auth.admin.generateLink({ type: 'magiclink', email })
     → devolve properties.hashed_token
  7. resposta { status: 'authorized' | 'rejected', message, subscription_id, session_token_hash? }
cliente
  ├─ session_token_hash → supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) → sessão
  ├─ 'authorized' → navigate('/definir-senha') (ProtectedRoute força enquanto must_set_password)
  └─ 'rejected'   → mesmo caminho, com banner "pagamento recusado, tente outro cartão" em /creditos
```

Regras: nunca ecoar o body na resposta nem em logs; `payer` mascarado em qualquer `console.error`;
senha aleatória nunca sai do servidor; token do Brick é de uso único (recusa exige novo submit).

**B. Assinar logado** (usuário `legacy`, `trial` expirado, `rejected` ou cancelado): mesma
`SubscribePage` sem os campos de conta; `subscribe` entra no ramo 3a. Também acessível por
`/creditos` → "Assinar".

**C. Webhook `mp-webhook`** (uma function, três tópicos; lógica pura em `_shared/mpEvents.ts` e
`_shared/mpSubscriptionEvents.ts`):

- `payment` → como hoje (extras). Um `payment` de cobrança recorrente não casa com nenhuma
  `credit_purchases` e é ignorado; o crédito do plano entra **só** pelo tópico de assinatura.
- `subscription_preapproval` → `GET /preapproval/{id}` → espelha `status`/`next_payment_date`/
  cartão em `subscriptions` (`authorized`→`authorized`, `paused`→`paused`, `cancelled`→
  `cancelled` + `cancelled_at`).
- `subscription_authorized_payment` → `GET /authorized_payments/{id}` → se `status` aprovado
  (`approved`/`processed` com `payment.status = 'approved'`) → `renew_subscription(sub, invoice,
  period_end = debit_date + 1 mês)`; se rejeitado/`recycling` → `mark_subscription_past_due`;
  analytics server `subscription_renewed` / `subscription_payment_failed`.
- Assinatura HMAC continua observabilidade (o refetch autoritativo com nosso token é a autorização).

**D. Cancelar** (`cancel-subscription`, autenticado; admin usa a mesma function com `userId`):
`PUT /preapproval/{id} { status: 'cancelled' }` → `cancel_subscription_local` → status
`cancelled`, `cancelled_at`; `plan_credits` seguem válidos até `plan_period_end`. Analytics
`subscription_cancelled`. Admin também registra em `admin_actions`.

**E. Trocar cartão** (`update-subscription-card`, autenticado): Brick com `amount` do plano →
`PUT /preapproval/{id} { card_token_id }` → espelha resposta.

**F. Extras com cartão** (`create-card-payment`, autenticado): pacote da tabela; insert
`credit_purchases` (`pending`, `provider 'mercadopago'`, `payment_method 'card'`, attribution) →
`POST /v1/payments { transaction_amount, token, description, installments: 1, payment_method_id,
issuer_id, payer: { email, identification }, external_reference: purchase.id, notification_url,
statement_descriptor: 'OLHAR SINGULAR', binary_mode: true, metadata: { purchase_id } }` com
`X-Idempotency-Key = purchase.id` → `approved` → mesmo caminho do webhook (update `pending →
approved` + `grant_credits`) de forma síncrona; `rejected` → `status 'rejected'` +
`status_detail` mapeado para pt-BR; qualquer outro → fica `pending` e o webhook decide.
`binary_mode` elimina `in_process`.

**G. Extras com Pix**: `create-pix-payment` + `PixPaymentDialog` inalterados, só lendo o pacote
da tabela.

**H. Consumo** (`adapt-activity`, `extract-questions`, `chat`): passam pelas RPCs acima. A
resposta 402 ganha `{ error, plan_balance, extra_balance, balance, required, reason:
'insufficient_credits' }`. `extract-questions` deixa de ler `free_extraction_used`.

**I. Admin cria usuário** (`admin-create-user`, super-admin): body `{ email, full_name, mode:
'trial' | 'exempt' }` → `auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo:
`${APP_URL}/redefinir-senha` })` (o convite é enviado pelo SMTP do Supabase; a pessoa define a
senha na tela existente) → `profiles.access_kind = mode`, e para `trial` o relógio começa quando
o convite é aceito (trigger da 4.2) → `admin_actions`.

**J. Definir senha no 1º acesso** (`set-initial-password`, autenticado): valida mínimo 6 →
`auth.admin.updateUserById(user, { password })` → `profiles.must_set_password = false`. A UI
(`/definir-senha`) é obrigatória enquanto a flag estiver ligada (`ProtectedRoute` redireciona
qualquer rota para ela, exceto sair).

### 4.4 Estados e direito de uso (cliente e servidor com a mesma regra)

`src/lib/domain/access.ts` → `computeAccess(profile, subscription, now)`:

| access_kind | plano ativo? | resultado |
|-------------|--------------|-----------|
| exempt | n/a | `unlimited`; nada é debitado; ledger delta 0 |
| trial | `plan_period_end > now` | `planCredits` + `extraCredits`; banner "X dias de teste" |
| trial | expirado | só `extraCredits`; se 0 → `paywalled` |
| subscriber | assinatura `authorized` e `plan_period_end > now` | `planCredits` + `extraCredits` |
| subscriber | `past_due` | idem (créditos congelados, sem reset); banner "pagamento pendente" |
| subscriber | `cancelled`/`rejected`/sem assinatura | plano até `plan_period_end`, depois só extras |
| legacy | sem assinatura | só `extraCredits`; se 0 → `paywalled` |

`paywalled` = total disponível 0 e não isento. O servidor aplica a mesma regra dentro de
`consume_credits` (gate real); o cliente só antecipa a UX (CTA para `/assinar` e `/creditos`).
Super-admin **não** tem bypass automático: usa Cortesia se quiser.

### 4.5 Frontend

- **Rotas novas:** `/assinar` (pública), `/definir-senha` (protegida), `/termos`, `/privacidade`,
  `/reembolso` (públicas, conteúdo marcado como rascunho até o jurídico entregar). Removida:
  `/creditos/sucesso`.
- **`AuthPage`**: só login. `?signup=1` redireciona para `/assinar`. Textos de "Cadastre-se" saem.
- **`ProtectedRoute`**: além da sessão, força `/definir-senha` enquanto `profile.must_set_password`.
- **`Layout`**: badge mostra o total disponível; faixa de estado (trial com dias restantes,
  paywall com CTA, `past_due`, `must_set_password`).
- **`CreditsPage`**: seções "Sua assinatura" (plano, status, próxima cobrança, cancelar, trocar
  cartão, ou CTA assinar), "Créditos extras" (pacotes da tabela; Pix e cartão via Brick) e
  "Histórico" (ledger com rótulos por `type` e `bucket`).
- **`components/payments/MpCardBrick.tsx`**: wrapper fino sobre `@mercadopago/sdk-react`
  (`initMercadoPago(VITE_MP_PUBLIC_KEY, { locale: 'pt-BR' })` uma vez; `<CardPayment>` com
  `initialization { amount, payer: { email } }`, `customization.paymentMethods.maxInstallments = 1`,
  `onSubmit(formData)` devolve `{ token, issuer_id, payment_method_id, installments, payer }`).
  Mockado nos testes; sem `VITE_MP_PUBLIC_KEY` renderiza erro visível, não quebra o build.
- **Paywall UX**: `StepGenerate` (402), `QuestionBankPage` (`canExtract` pelo total), `ChatPage`:
  mensagem única "Seus créditos acabaram" com botões "Assinar" e "Comprar créditos extras".
- **Landing**: header com "Entrar" e "Assinar"; hero com "Planos a partir de R$19,90/mês"; pricing
  lendo `plans` e citando extras; FAQ reescrita (créditos do plano renovam todo mês; extras não
  expiram; cancele quando quiser; reembolso em 7 dias; assinatura no cartão, extras no Pix ou
  cartão); CTA final "Assinar agora"; footer com Termos, Privacidade, Reembolso e CNPJ (placeholder).
  Somem todos os "Começar grátis", "50 créditos grátis", "sem cartão" e "Créditos nunca expiram".
- **SEO**: `index.html` com título "Olhar Singular | Adaptação inclusiva com IA", description,
  `og:*`/`twitter:*`, canonical `.com`; `robots.txt` com as rotas reais; `sitemap.xml` `.com` com
  `/`, `/assinar`, `/auth`, `/termos`, `/privacidade`, `/reembolso`.
- **Analytics (`src/lib/analytics/`)**: `dataLayer.push` tolerante à ausência do GTM; defaults de
  Consent Mode v2 `denied`; `ConsentBanner` (aceitar/recusar, persistência local, versão do
  texto); captura de atribuição na LP (utm_*, gclid, fbclid, `_ga`, `_fbp`, `_fbc`, referrer,
  landing_path) guardada em `sessionStorage` e enviada no checkout; eventos GA4 recomendados
  (`view_item_list`, `select_item`, `begin_checkout`, `add_payment_info`, `purchase` só no cartão
  síncrono) + custom (`subscription_started`, `paywall_shown`, `consent_updated`). `event_id` =
  id da compra/assinatura para dedupe com o servidor. GTM entra no `index.html` via
  `%VITE_GTM_ID%` (sem id, nada é injetado).
- **CSP (`vercel.json`)**: `script-src` + `https://sdk.mercadopago.com https://http2.mlstatic.com
  https://www.mercadopago.com https://www.googletagmanager.com https://connect.facebook.net`;
  `connect-src` + `https://api.mercadopago.com https://api.mercadolibre.com
  https://*.mercadopago.com https://www.google-analytics.com https://analytics.google.com
  https://www.googletagmanager.com https://www.facebook.com`; `frame-src` + `https://*.mercadopago.com
  https://*.mercadolibre.com https://www.googletagmanager.com`; `img-src` já aceita `https:`.
  Validação obrigatória num Preview do Vercel com o Network tab antes de mesclar.

### 4.6 Admin

- `admin-dashboard` devolve por usuário: `access_kind`, `plan_credits`, `plan_period_end`,
  `credit_balance`, `cpf` (mascarado `***.***.***-XX`), assinatura (`status`, plano,
  `next_payment_date`, `mp_preapproval_id`), `is_active` (ban).
- `AdminPage` em abas: **Usuários** (tabela com filtro por estado: trial, assinante, inadimplente,
  bloqueado, cortesia, legado, inativo), **Assinaturas e receita** (contagens por status, MRR
  estimado = soma dos preços dos planos `authorized`), **Custos de IA** (o que existe hoje).
- Ações: **Criar usuário** (diálogo: e-mail, nome, Trial/Cortesia), **Estender trial** (7/14/30),
  **Cancelar assinatura**, **Dar créditos extras** (existente), **Inativar/Reativar** (ban,
  existente). Tudo registrado em `admin_actions`.
- `admin-user-status` e `admin-grant-credits` passam a gravar em `admin_actions`.

### 4.7 Remoção da Stripe

Apagar `create-stripe-checkout/`, `stripe-webhook/`, `_shared/stripeCheckoutParams.ts(+test)`,
`_shared/stripeEvents.ts(+test)`, `CreditsSuccessPage(+test)` e a rota; `useCreateStripeCheckout`
e seus testes; bloco `[functions.stripe-webhook]` do `config.toml`; bloco Stripe do
`.env.example`; `Makefile` passa a derivar `FUNCTIONS` do disco (a lista hardcoded já está
quebrada); docs vivas (`dominio-orientador`, `edge-fn-writer`, `environment.md`) atualizadas;
specs antigas da Stripe marcadas como superadas. `credit_purchases.provider` CHECK mantém
`'stripe'`. Remoção no remoto (functions, secrets, endpoint) é passo do runbook de deploy.

### 4.8 Segurança

- RPCs novas com `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` + `GRANT TO service_role`;
  assinaturas existentes só via `CREATE OR REPLACE`.
- `prevent_credit_self_mutation` cobre `plan_credits`, `plan_period_end`, `access_kind`, `cpf`,
  `must_set_password`; `credit_paywall_guard.test.sql` ganha um `throws_ok` por coluna.
- Tabelas novas: `plans`/`credit_packages` leitura pública filtrada; `subscriptions`/
  `subscription_invoices` leitura do dono; `admin_actions`/`checkout_attempts` sem policy
  (só `service_role`).
- `subscribe` público: rate limit, validação de e-mail, plano só pela tabela, `X-Idempotency-Key`,
  nenhum log de `payer`/senha, resposta nunca ecoa campos do request. Enumeração de e-mail via 409
  é aceita como custo do endpoint de compra.
- CPF: só dígitos, mascarado em logs e no admin; nunca enviado ao Meta/GA.
- Senha em trânsito só no `set-initial-password`, nunca logada.

### 4.9 Analytics server-side (`_shared/analyticsEvents.ts`)

Builders puros para GA4 Measurement Protocol (`client_id` da atribuição ou `user_id` hash) e Meta
CAPI (`event_name`, `event_id`, `user_data` com e-mail SHA-256, `custom_data` com valor e moeda).
`sendAnalyticsEvents()` roda fire-and-forget com timeout de 3s e só se os secrets existirem
(`GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `META_PIXEL_ID`, `META_CAPI_TOKEN`). Eventos:
`purchase` (extras aprovados), `subscription_started`, `subscription_renewed`,
`subscription_payment_failed`, `subscription_cancelled`, `refund`.

## 5. Testes

- **Vitest (gate 100%)**: módulos puros novos em `_shared/` (`mpCardPayment.ts`, `mpPreapproval.ts`,
  `mpSubscriptionEvents.ts`, `mpStatusDetail.ts`, `analyticsEvents.ts`, `checkoutRateLimit.ts`,
  `subscribeInput.ts`, `adminCreateUser.ts`), `src/lib/domain/access.ts`, `src/lib/analytics/*`,
  hooks (`usePlans`, `useSubscription`, `useCreateCardPayment`, `useSubscribe`), páginas e
  componentes novos com o Brick mockado. `index.ts` continua fora da cobertura: nada de regra fica
  nele.
- **pgTAP** (`supabase/tests/database/`): `plans_rls`, `credit_packages_rls`, `subscriptions_rls`,
  `consume_credits_two_buckets` (plano primeiro, expirado, isento, insuficiente, ledger por balde),
  `reservation_refund_origin`, `subscription_activate_renew` (reset, idempotência por invoice,
  past_due), `trial_on_confirm` (INSERT sem confirmação não inicia; UPDATE inicia uma vez;
  createUser confirmado inicia), `admin_extend_trial`, `legacy_migration` (compensação, pendentes
  fechadas), `credit_paywall_guard` e `function_hardening` estendidos, `signup_credits` reescrito
  (default 0). `plan(N)` recontado em cada arquivo tocado.
- **Deno**: `deno check` das functions novas (bundle); `denoImportGraph.test.ts` cobre imports.
- **Browser (skill `validate-adaptar`)**: fluxo `/assinar` anônimo e logado, cartão de extras, Pix,
  paywall, definir senha, admin criar usuário. Credenciais **TEST** do MP (usuário vendedor de
  teste da seção STAGING) no local: novo alvo `make fn-serve-mp-test` gera um env efêmero
  mapeando `ACCESS_TOKEN_MP` → `ACCESS_TOKEN_MP_PROD` e `PUBLIC_KEY_MP` → `VITE_MP_PUBLIC_KEY`,
  removido no cleanup. Pix não existe no sandbox: só o smoke de R$1 em produção.

## 6. Runbook de deploy (NÃO executado nesta rodada; ordem obrigatória)

1. Painel MP: conferir "credenciais de produção ativadas"; cadastrar webhook
   `https://ztngcyflcxgvohtdlbhq.supabase.co/functions/v1/mp-webhook` com tópicos Pagamentos,
   Assinaturas (`subscription_preapproval`) e Pagamentos de assinatura
   (`subscription_authorized_payment`); atualizar `VERIFY_TOKEN_MP_PROD` se o segredo mudar.
2. Supabase secrets: `supabase secrets set APP_URL=https://professor.olharsingular.com
   VITE_MP_PUBLIC_KEY=... GA4_MEASUREMENT_ID=... GA4_API_SECRET=... META_PIXEL_ID=...
   META_CAPI_TOKEN=... --project-ref ztngcyflcxgvohtdlbhq`; `supabase secrets unset
   STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET ACCESS_TOKEN_MP`.
3. `create extension if not exists pg_cron;` no projeto e reexecutar o bloco DO da migration de
   reservas (reconciliação a cada 15 min).
4. Auth remoto (Management API, PATCH cirúrgico, nunca `config push`): `disable_signup = true`.
5. GitHub: `gh secret set VITE_MP_PUBLIC_KEY` e `VITE_GTM_ID`; Vercel: mesmas vars em Production e
   Preview.
6. Merge em `main` **backend antes do front**: `supabase/**` primeiro (db push + functions),
   confirmar `subscribe`/`create-card-payment`/`mp-webhook` no ar, depois o front (Vercel).
7. Remover do remoto: `supabase functions delete create-stripe-checkout`, `stripe-webhook`,
   `check-and-deduct-credits`, `regenerate-question`. Stripe Dashboard: exportar histórico, revogar
   Secret key, conferir o pagamento live não creditado.
8. Validar num Preview do Vercel: Brick renderiza (CSP), GTM carrega, banner de consentimento.
9. Smoke em produção com super-admin: pacote R$1 no cartão e no Pix; plano de teste R$1/mês →
   ativa, webhook renova (aguardar 1ª parcela), cancelar pelo app.

## 7. Fases de implementação (cada uma = commits próprios na branch `redesign/assinatura-mp`)

1. **Cartão inline MP + remoção da Stripe** (extras via `create-card-payment`, Brick, CreditsPage,
   `credit_packages`, CSP, Makefile, config.toml, docs vivas).
2. **Dois baldes + trial + isenção + migração de dados** (schema, RPCs, pgTAP, `access.ts`,
   Layout/paywall, `adapt`/`extract`/`chat`, admin read-only, fim do signup na UI).
3. **Assinatura** (`plans`, `subscriptions`, `subscribe` logado, `mp-webhook` com tópicos,
   `cancel-subscription`, `update-subscription-card`, CreditsPage "Sua assinatura").
4. **Funil da LP** (`/assinar` anônimo com criação de conta e magic link, `/definir-senha`,
   `AuthPage` só login, copy da LP, páginas legais, SEO).
5. **Admin** (criar usuário Trial/Cortesia, estender trial, cancelar, abas, filtros,
   `admin_actions`).
6. **Analytics** (GTM/dataLayer, Consent Mode, atribuição, eventos server-side).
7. **Fechamento** (docs vivas, `.env.example`, runbook, memória do projeto).

## 8. Riscos e pendências

- Preço dos extras vs. plano (decisão 3): o avulso de R$59,90 rende mais crédito que o plano do
  mesmo valor. Tabela permite ajustar sem código.
- `sandbox_mode: true` na aplicação de produção do MP: conferir no painel antes do smoke.
- Pagamento live da Stripe possivelmente não creditado: a migração lista; crédito manual é decisão
  do dono.
- Textos legais e IDs de analytics (GTM, GA4, Meta) ainda não existem: código nasce em modo
  rascunho/no-op e não bloqueia a implementação, mas bloqueia ir a produção.
- Pix recorrente ("Pix Automático") depende de habilitação na conta MP; fora desta rodada.
- Primeira cobrança assíncrona: se a 1ª parcela falhar, o usuário já usou créditos do plano por
  até ~1h; aceito (webhook zera o balde e marca `past_due`).
