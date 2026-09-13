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
| 12 | Campos do checkout | Nome + e-mail + cartão (Brick, com CPF do titular). Conta criada com **senha aleatória**; no 1º acesso o app obriga a definir senha. **Sessão só pelo link de acesso enviado ao e-mail** (`signInWithOtp` → `/definir-senha`): prova de posse do e-mail, decidido em 2026-09-13 (antes: magic link gerado no servidor e trocado por `verifyOtp`, que permitia abrir conta em nome de e-mail alheio). |
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
- **`reverse_credit_reservation`**: a reserva guarda `period_end_at_open`; `plan_charged` volta
  ao plano só se `profiles.plan_period_end = period_end_at_open` e `> now()` (mesmo ciclo ainda
  ativo); se o ciclo mudou ou expirou, a parcela do plano é **descartada** (ledger `refund` com
  delta 0 e nota), nunca convertida em extra. `extra_charged` volta aos extras. Também usada por
  `extract-questions`, que migra para o modelo de reserva (o estorno via `grant_credits 'refund'`
  converteria crédito do plano em extra e creditaria usuário isento).
- **`grant_credits`**: inalterada (extras). **`admin_grant_credits`**: inalterada (extras).
- **`activate_subscription(p_user_id, p_subscription_id, p_period_end)`** e
  **`renew_subscription(p_subscription_id, p_invoice_id, p_period_end)`**: `access_kind =
  'subscriber'`, `plan_credits = monthly_credits` do plano (reset, nunca soma), `plan_period_end =
  p_period_end`, `subscriptions.status = 'authorized'`, ledger `plan_reset` (se sobrou) +
  `plan_grant`. `renew_*` insere em `subscription_invoices` primeiro; conflito de pk → retorna
  `already_processed` sem tocar saldo.
- **Primeira parcela vs. renovação** (achado da revisão): `activate_subscription` grava
  `current_period_start` e um invoice sintético `activation`. Quando a 1ª `authorized_payment`
  aprovada chega (até ~1h depois), `renew_subscription` **não** reseta: só espelha
  `mp_payment_id` e marca `first_payment_confirmed`. Reset + `plan_grant` acontecem apenas quando
  `debit_date >= current_period_end` (ciclo novo). `subscription_invoices` é um **espelho com
  status** (upsert por id; `granted_at`), e o crédito só entra na transição `granted_at IS NULL
  → now()` com `payment.status = 'approved'`: o mesmo id passa por `recycling` e depois
  `approved` sem perder a concessão. Tudo com `FOR UPDATE` no perfil.
- **`clawback_subscription(p_subscription_id)`**: 1ª parcela rejeitada (nenhum invoice aprovado)
  → `plan_credits = 0`, `plan_period_end = now()`, ledger `clawback`, status `rejected`. Fecha o
  vetor "cartão passa na autorização e nunca paga".
- **`mark_subscription_past_due(p_subscription_id)`** (renovação falhou): só muda status; como
  `plan_period_end` já passou, o balde do plano fica indisponível pela regra lazy de
  `consume_credits` (sem reset até pagar). **`cancel_subscription_local(...)`**: status
  `cancelled`, créditos do ciclo até `plan_period_end`. Sem dependência de pg_cron.
- **`start_trial_on_confirm()`**: trigger `AFTER UPDATE OF email_confirmed_at ON auth.users FOR
  EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)`, corpo
  com `EXCEPTION WHEN OTHERS THEN RAISE WARNING; RETURN NEW` (erro aqui viraria 500 no GoTrue e
  travaria o aceite do convite). `handle_new_user` lê `raw_user_meta_data->>'access_kind'`
  (aceita só `trial`/`exempt`; default `subscriber`), então o `admin-create-user` passa
  `data: { full_name, access_kind }` no convite e o ramo "INSERT já confirmado" é real. Se
  `access_kind = 'trial'` e `trial_started_at IS NULL` → `plan_credits = 50`, `plan_period_end =
  now() + 7 days`, `trial_started_at = now()`, ledger `trial_grant`. Função revogada de
  `anon/authenticated` (padrão 20260816) e coberta em `function_hardening.test.sql`.
  `admin_extend_trial` recusa enquanto `trial_started_at IS NULL`.
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
     ├─ 2xx e status 'authorized' → update subscriptions (mp id, mp_status, next_payment_date,
     │     card_brand = payment_method_id, card_last_four do additionalData do Brick)
     │     → RPC activate_subscription(period_end = next_payment_date ?? now()+1 month)
     │     → analytics server: subscription_started
     ├─ 2xx e status 'pending' (validação assíncrona do cartão) → subscriptions.status = 'pending';
     │     o webhook subscription_preapproval ativa quando virar 'authorized'
     └─ HTTP não-2xx OU 2xx com outro status → subscriptions.status = 'rejected' + status_detail;
           a conta criada em 3b FICA (decisão 14), mas sem sessão (ver 6)
  6. sessão só com pagamento: se o usuário foi criado agora E o preapproval voltou 'authorized'
     ou 'pending' → auth.admin.generateLink({ type: 'magiclink', email }) → devolve
     properties.hashed_token. No caminho 'rejected' NENHUM token é devolvido: entregar sessão a
     quem só provou ter um token de cartão qualquer permitiria registrar a conta de um e-mail
     alheio e ficar com o refresh token dela (achado da revisão). O cliente então chama
     supabase.auth.signInWithOtp({ email }) e o link de acesso vai POR E-MAIL (prova de posse);
     dentro do app a pessoa tenta outro cartão em /assinar (ramo 3a).
  7. resposta { status: 'authorized' | 'pending' | 'rejected', message, subscription_id,
     account_created: boolean, session_token_hash? }
cliente
  ├─ session_token_hash → supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) → sessão,
  │     consumido na hora e nunca guardado em estado/sessionStorage
  ├─ 'authorized' → navigate('/definir-senha') (ProtectedRoute força enquanto must_set_password)
  ├─ 'pending'    → mesmo caminho, faixa "confirmando seu cartão" até o webhook ativar
  └─ 'rejected'   → account_created ? signInWithOtp + tela "conta criada, confira seu e-mail para
                    entrar e tentar outro cartão" : mensagem do MP + Brick novo (usuário logado)
```

Regras adicionais do `subscribe`: `Authorization` presente mas que não é um JWT de usuário
válido (a publishable key vai sempre no header) cai no ramo anônimo, nunca em 401; usuário já
com assinatura viva → 409 `already_subscribed`; `access_kind = 'exempt'` → 409 `exempt_user`;
`access_kind` NÃO é escrito no passo 3c (só `activate_subscription` promove a `subscriber`);
`cpf` e `terms_accepted_at`/`terms_version` gravados só após `authorized`/`pending`; uma linha
`pending` com mais de 15 minutos é marcada `rejected` (`status_detail 'abandoned'`) antes de
uma nova tentativa, e o índice único de "assinatura viva" cobre só `authorized`, `past_due` e
`paused`. Erro de rede/timeout no POST nunca é repetido às cegas: consulta
`GET /preapproval/search?external_reference=<id>` antes de decidir (o MP não documenta
idempotência para esse endpoint).

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
| subscriber | `pending` (cartão em validação) | plano já liberado (ativação otimista); faixa "confirmando seu cartão" |
| subscriber | `past_due` (renovação falhou) | balde do plano **indisponível** (o período venceu); só `extraCredits`; faixa "pagamento pendente, atualize o cartão" com CTA trocar cartão |
| subscriber | `rejected` na 1ª parcela | `clawback`: balde do plano zerado; só extras; faixa "pagamento recusado" com CTA assinar de novo |
| subscriber | `paused` (pausada no painel do MP) | como `past_due` |
| subscriber | `cancelled` | plano até `plan_period_end` ("seu plano vale até dd/mm"), depois só extras |
| subscriber | sem assinatura viva | só extras; se 0 → `paywalled` |
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
  https://*.mercadolibre.com https://www.googletagmanager.com`; `style-src` e `font-src` +
  `https://http2.mlstatic.com` (o Brick carrega CSS e fontes de lá); `img-src` já aceita
  `https:`. **GTM não carrega em `/assinar` nem em `/definir-senha`**: uma tag Custom HTML no
  container rodaria na mesma origem que recebe `session_token_hash`, e-mail, CPF e o token do
  cartão. Validação obrigatória num Preview do Vercel com o Network tab antes de mesclar.

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
   CHECKOUT_HASH_SECRET=<aleatório longo> GA4_MEASUREMENT_ID=... GA4_API_SECRET=... META_PIXEL_ID=...
   META_CAPI_TOKEN=... --project-ref ztngcyflcxgvohtdlbhq` (os de analytics podem esperar os IDs:
   sem eles as functions não enviam nada); `supabase secrets unset STRIPE_SECRET_KEY
   STRIPE_WEBHOOK_SECRET ACCESS_TOKEN_MP`.
3. `create extension if not exists pg_cron;` no projeto e reexecutar o bloco DO da migration de
   reservas (reconciliação a cada 15 min).
4. Auth remoto (Management API, PATCH cirúrgico, nunca `config push`): `disable_signup = true`;
   `uri_allow_list` com `https://professor.olharsingular.com/redefinir-senha`,
   `.../redefinir-senha?convite=1`, `.../definir-senha`, `.../dashboard`; templates de e-mail
   **Invite user** (`supabase/templates/invite.html`, assunto "Seu convite para o Olhar Singular")
   e **Magic Link** (é o e-mail que toda conta nova recebe depois de pagar: `signInWithOtp` com
   `emailRedirectTo` `/definir-senha`; usar `supabase/templates/magic_link.html`). Conferir que
   `mailer_otp_exp` cobre o tempo entre pagar e abrir o e-mail (padrão 1h serve).
5. GitHub: `gh secret set VITE_MP_PUBLIC_KEY` e `VITE_GTM_ID`; Vercel: mesmas vars em Production e
   Preview. `subscribe` precisa de `verify_jwt = false` no remoto (o CI faz deploy lendo o
   `config.toml`; conferir no Dashboard após o 1º deploy).
6. Merge em `main` **backend antes do front**: `supabase/**` primeiro (db push + functions),
   confirmar `subscribe`/`create-card-payment`/`mp-webhook` no ar, depois o front (Vercel).
7. Remover do remoto: `supabase functions delete create-stripe-checkout`, `stripe-webhook`,
   `check-and-deduct-credits`, `regenerate-question`. Stripe Dashboard: exportar histórico, revogar
   Secret key, conferir o pagamento live não creditado.
8. Validar num Preview do Vercel: Brick renderiza (CSP), GTM carrega fora de `/assinar` e
   `/definir-senha` (Network tab), banner de consentimento, `/termos`, `/privacidade`, `/reembolso`.
9. Smoke em produção com super-admin: pacote R$1 no cartão e no Pix; plano de teste R$1/mês →
   ativa, webhook renova (aguardar 1ª parcela), cancelar pelo app. Depois, funil anônimo com um
   e-mail real e o plano de teste (super-admin não é anônimo: usar um e-mail novo, cartão real,
   R$1): conta criada, `/definir-senha`, assinatura ativa; conferir `admin_actions` e
   `checkout_attempts` sem e-mail em claro.
10. Admin: convidar um usuário Trial e um Cortesia e aceitar os convites (`/redefinir-senha?convite=1`
   com "Crie sua senha"); conferir o relógio do trial começando no aceite.
11. Pendências conhecidas: `make typecheck-app` (type-check real) tem 265 erros pré-existentes
   (testes com `vi.fn()` sem generics e o núcleo do Adaptar); `make fn-check` tem 8, todos em
   `src/lib/adaptation/canonical/*`. Nenhum em pagamentos. Torná-los bloqueantes é tarefa própria.

## 7. Fases de implementação (cada uma = commits próprios na branch `redesign/assinatura-mp`)

Cada fase deixa a suíte verde e o produto coerente ("estado ao final" entre parênteses).

1. **Cartão inline MP + remoção da Stripe** (extras via `create-card-payment`, Brick, CreditsPage,
   `credit_packages`, RPC atômica de aprovação, CSP, Makefile, config.toml, docs vivas). *Estado:
   produto igual ao de hoje, só com outro trilho de cartão.* **Concluída em 2026-09-12.**
2. **Dois baldes + trial + isenção + migração de dados + endurecimento** (schema, RPCs com
   `FOR UPDATE`, `extract-questions` no modelo de reserva, pgTAP, `access.ts`, Layout/paywall com
   CTA para `/creditos`, `adapt`/`chat`, admin read-only + "Alterar acesso", `AuthPage` só login,
   `config.toml` `enable_signup = false`, DROP das policies INSERT/DELETE de `profiles` e INSERT de
   `credit_transactions`, limpeza da copy "grátis" dentro do app). *Estado: quem existe continua
   usando; ninguém novo entra sem admin.*
3. **Assinatura** (`plans`, `subscriptions`, `subscription_invoices`, `subscribe` logado,
   `mp-webhook` com tópicos, `cancel-subscription`, `update-subscription-card`,
   `reconcile_pending_subscriptions`, CreditsPage "Sua assinatura", `/assinar` redirecionando
   para `/creditos` quando anônimo). *Estado: usuário logado assina e renova.*
4. **Funil da LP** (`/assinar` anônimo com criação de conta e magic link só com pagamento,
   `/definir-senha`, `set-initial-password` com revogação das outras sessões, copy da LP, páginas
   legais, SEO, `invite.html`). *Estado: visitante paga e entra.*
5. **Admin** (criar usuário Trial/Cortesia por convite, estender trial, cancelar, alterar e-mail,
   abas, filtros, `admin_actions`).
6. **Analytics** (GTM em runtime fora do checkout, Consent Mode, atribuição pós-consentimento,
   eventos server-side condicionados ao consentimento).
7. **Fechamento** (docs vivas, `.env.example`, runbook, typecheck real, `fn-check` bloqueante,
   memória do projeto).

## 8. Riscos e pendências

- **Conta criada em nome de um e-mail alheio (apontado pela revisão de segurança da Fase 4):
  resolvido em 2026-09-13.** O checkout nunca devolve sessão; a conta nova entra pelo link de
  acesso enviado ao e-mail (`signInWithOtp`, `emailRedirectTo` `/definir-senha`). Quem pagar com
  e-mail alheio cria uma conta que não consegue abrir; o dono do e-mail recupera pelo link ou por
  "Esqueci minha senha". Custo: um clique no e-mail depois de pagar.

- Preço dos extras vs. plano (decisão 3): o avulso de R$59,90 rende mais crédito que o plano do
  mesmo valor. Tabela permite ajustar sem código.
- `sandbox_mode: true` na aplicação de produção do MP: conferir no painel antes do smoke.
- Pagamento live da Stripe possivelmente não creditado: a migração lista; crédito manual é decisão
  do dono.
- Textos legais e IDs de analytics (GTM, GA4, Meta) ainda não existem: código nasce em modo
  rascunho/no-op e não bloqueia a implementação, mas bloqueia ir a produção.
- Pix recorrente ("Pix Automático") depende de habilitação na conta MP; fora desta rodada.
- Primeira cobrança assíncrona: se a 1ª parcela falhar, o usuário já pode ter usado créditos do
  plano por até ~1h; aceito. O webhook faz `clawback` (zera o balde, status `rejected`).
- `make fn-check` (Deno) encontrou 15 erros pré-existentes (schema Zod compartilhado sob strict,
  casts de RPC para `Promise`, tipo do client em `authorizeSuperAdmin`, `gapTokenGuard`).
  Corrigir na Fase 7 antes de tornar o alvo bloqueante.
- `npm run typecheck` não checa nada (tsconfig raiz `files: []`) e um `tsc -p tsconfig.app.json`
  real reporta 247 erros, quase todos em testes. Fase 7: `tsconfig.typecheck.json` só para
  `src/**` sem testes, e o script passa a rodá-lo.

## 9. Ajustes da revisão adversarial (2026-09-12)

Três revisores independentes (dinheiro/segurança, APIs do MP e do Supabase, produto/testabilidade)
leram este spec contra o código. O que mudou no design está incorporado nas seções acima; abaixo,
o registro achado → decisão para o que não cabia num parágrafo.

**Segurança e dinheiro**

- `profiles` tem policies de INSERT e DELETE para o dono (initial_schema) e os guards são só
  BEFORE UPDATE: um usuário podia apagar e reinserir o próprio perfil com `credit_balance`,
  `access_kind = 'exempt'` e `is_super_admin = true`. **Fase 2 remove as duas policies e revoga
  INSERT/DELETE de `anon, authenticated` em `profiles`** (a linha nasce só por `handle_new_user`),
  com `throws_ok` em `credit_paywall_guard.test.sql`. Mesmo tratamento para o INSERT de
  `credit_transactions` (ledger só por RPC).
- Aprovação de compra + grant viraram **uma RPC** (`approve_purchase_and_grant`), já entregue na
  Fase 1; `reject_pending_purchase` é o par.
- Endpoint público `subscribe`: e-mail normalizado (minúsculas; em gmail, sem pontos e sem `+tag`)
  e hasheado com HMAC (`CHECKOUT_HASH_SECRET`); IP = primeiro item de `x-forwarded-for`; disjuntor
  global (mais de 20 recusas em 10 min → 503 para anônimos por 30 min); purga de
  `checkout_attempts` com mais de 24h dentro da própria função; `MP_DEVICE_SESSION_ID` do SDK
  enviado ao antifraude quando disponível. Turnstile fica como plano B se houver abuso.
- `set-initial-password` e o fluxo de recuperação revogam as demais sessões
  (`auth.admin.signOut(jwt, 'others')`) depois de trocar a senha.
- CPF: é o **do titular do cartão** (rótulo na UI); gravado em `profiles.cpf` só se `NULL` e só
  pelo `subscribe`; `subscription_invoices.raw` sem `payer`/`card`; `admin_actions.payload` sem
  e-mail nem CPF; dígitos verificadores validados no servidor.
- Aceite dos Termos: `profiles.terms_accepted_at` e `terms_version`, gravados pelo `subscribe` e
  pelo `create-card-payment` na 1ª compra (registro contratual, distinto do consentimento de
  analytics).
- `mpEvents`: `external_reference` validado como UUID antes da consulta (evita 500 e tempestade de
  retries) e pagamento recorrente (`metadata.preapproval_id`) ignorado com log.
- Ações admin com `userId` no body exigem `authorizeSuperAdmin`; `cancel-subscription` e
  `update-subscription-card` resolvem a assinatura pelo `auth.uid()` do chamador, nunca pelo body.

**Mercado Pago**

- `statement_descriptor` não existe no `/preapproval`: o nome na fatura da assinatura vem da
  configuração da conta (runbook, passo 1). Decisão 23 vale integralmente só para os extras.
- Cartão salvo: `card_last_four` vem do 2º argumento do `onSubmit` do Brick (`additionalData`),
  `card_brand` do `payment_method_id` do preapproval.
- O Brick pré-preenchido com e-mail **esconde** o campo: montar só depois do passo "confira seu
  e-mail" e remontar com `key={email}`; `payer_email` no servidor é sempre o da conta.
- Sandbox: Bricks não suportam contas de teste como comprador; a validação local usa credenciais
  do vendedor de teste + cartões de teste (titular `APRO`/`OTHE`, CPF 12345678909); o funil
  anônimo com e-mail real só se prova no smoke de R$1 em produção. `processed` no
  `authorized_payment` **não** significa pago: renovar só com `payment.status = 'approved'`.
- Recusa na criação do preapproval pode vir como HTTP não-2xx ou 2xx com outro status; ambos →
  `rejected`. A FAQ menciona a cobrança de validação devolvida.

**Supabase Auth e cliente**

- `AuthContext` ganha `profileLoading` e adia `fetchProfile` (`setTimeout(0)`) dentro do
  `onAuthStateChange`; `ProtectedRoute` devolve `null` enquanto carrega e só então força
  `/definir-senha` (fora do `Layout`, com `AuthLayout` e botão Sair); `set-initial-password` →
  `refreshProfile()` antes de navegar.
- Convite do admin: `supabase/templates/invite.html` + `[auth.email.template.invite]`;
  `redirectTo` `.../redefinir-senha?convite=1` (na allowlist de produção, runbook);
  `ResetPasswordPage` troca a copy para "Crie sua senha" e mantém a sessão indo ao `/dashboard`.
- Migração: os super-admins de produção ficam `exempt`; a ação admin **Alterar acesso**
  (legacy/trial/exempt) e **Alterar e-mail** entram no escopo da Fase 5.

**Produto e copy**

- Trial que assina (decisão 5) e assinante que cancela e assina de novo (decisão 21) veem na
  `/assinar` o aviso "você ainda tem N créditos até dd/mm; ao assinar agora eles serão
  substituídos". Sem soma (decisão 4).
- `/assinar` sem `plano` (ou slug inválido) mostra o seletor com Profissional pré-selecionado.
- Compensação (decisão 6): +12 extras se `free_adaptation_used = false` e +5 se
  `free_extraction_used = false`.
- Limpeza de copy dentro do app (Fase 2): `StepBarrierSelection` "Grátis (primeira adaptação)",
  `QuestionBankPage` "Extração gratuita disponível", `DashboardPage` "Comprar", `LandingFooter`
  "Criar conta", `MyAdaptationsPage`/`AdaptacoesPage` "Gratuita", `TYPE_LABELS` com os tipos
  novos, ramo `signup` de `parseAuthError`, `confirmation.html` órfão, `robots.txt`. Um teste de
  guarda faz grep em `src/**/*.tsx` por `grátis|gratuit|nunca expiram|sem cartão|Stripe`.
- Host público único: `https://professor.olharsingular.com` em canonical, `og:url`, sitemap,
  `robots.txt` e `APP_URL` (decisão 27 satisfeita; o domínio raiz redireciona).
- a11y por componente novo: faixa do `Layout` `role="status"`; paywall `role="alert"` com foco;
  `ConsentBanner` `role="dialog"` + `aria-labelledby`, sem trap de foco; iframe do Brick com
  título; `/definir-senha` foca o `h1` ao montar.

**Analytics**

- GTM injetado em runtime por `src/lib/analytics/gtm.ts` só quando `VITE_GTM_ID` existe (nada de
  `%VITE_GTM_ID%` no `index.html`) e nunca em `/assinar` ou `/definir-senha`.
- Consentimento manda também no servidor: `sendAnalyticsEvents()` recebe `attribution.consent`;
  `user_data` (e-mail hash) só para o Meta com `ad_user_data = granted`; GA4 MP sem `client_id`
  quando `analytics_storage = denied`; `_ga/_fbp/_fbc` capturados só após o aceite; `utm_*`,
  `gclid`, `referrer` sempre. Nada de e-mail/CPF no `dataLayer`.

**Testabilidade**

- Fluxos das functions críticas em módulos puros com dependências injetadas
  (`_shared/subscribeFlow.ts` `runSubscribe(input, deps)`, `_shared/mpWebhookRouter.ts`), no
  padrão de `credits.ts`/`adminAuth.ts`; `index.ts` só monta `deps`.
- pgTAP a reescrever na Fase 2: `credit_reservations.test.sql` (sem `free`, com
  `plan_charged/extra_charged`), `deduct_credits.test.sql` (guards preservados no wrapper),
  `signup_credits.test.sql` (default 0), `credit_paywall_guard` (+5 colunas, +INSERT/DELETE);
  `free_adaptation_claim.test.sql` é apagado.
- Contratos (4.10) a fixar no plano de cada fase: hooks (`usePlans` `['plans']`,
  `useSubscription` `['subscription', userId]`, `useSubscribe`, `useCancelSubscription`,
  `useUpdateSubscriptionCard`), invalidações (`refreshProfile()`, `['credit_transactions']`,
  `['subscription']`), respostas das functions, e `computeAccess()` →
  `{ kind, planCredits, extraCredits, total, paywalled, periodEnd, daysLeft, subscriptionStatus }`.
