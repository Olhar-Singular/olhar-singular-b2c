# Teste grátis com cartão (7 dias) e estorno em autoatendimento (Design)

Data: 2026-09-15. Estende o spec `2026-09-11-pagamentos-assinatura-mp-design.md` (decisões 5, 8,
9, 14, 15, 19, 21 e 28 continuam valendo salvo onde este documento diz o contrário).

## 1. Objetivo

1. A landing deixa de pedir convite por e-mail. O card "Teste" passa a criar uma assinatura no
   Mercado Pago **com cartão obrigatório e sem cobrança por 7 dias**; no 8º dia o MP cobra o
   plano mais barato ativo (hoje R$ 39,90 / 300 créditos) e a conta vira assinante comum.
2. Nenhum e-mail de contato aparece no site. O convite do admin (Trial sem cartão / Cortesia)
   continua existindo, mas só é usado quando o contato chega por fora.
3. Quem foi cobrado e não queria (esqueceu de cancelar) tem **estorno em autoatendimento,
   sempre**, restrito à **última cobrança**, que **zera os créditos do plano** daquele mês.
4. Todas essas regras ficam **explícitas** na landing (card + FAQ), na página de assinatura,
   em Créditos e nos textos legais.

## 2. Decisões (com o dono, 2026-09-15)

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | O que a pessoa recebe nos 7 dias | **50 créditos** (igual ao trial por convite). No 8º dia cobra R$ 39,90 e a cota vira 300. |
| 2 | Trial por convite do admin (sem cartão) | **Continua**, mas sem nenhum e-mail/CTA no site. |
| 3 | Cancelar durante os 7 dias | **Paywall imediato**: nada é cobrado e os créditos do teste somem na hora. |
| 4 | Trial repetido | Barrado por **CPF** (além do e-mail): CPF que já teve trial ou assinatura só assina pago. |
| 5 | Estorno | **Autoatendimento** em Créditos, sempre disponível, só da última cobrança aprovada, zera `plan_credits` e cancela a assinatura. Vale mesmo com créditos parcialmente usados (devolve integral, zera o que sobrou). |
| 6 | Onde explicar | Card Teste (1 linha) + FAQ (pergunta nova) + `/assinar?trial=1` (caixa com a data exata da 1ª cobrança) + Créditos durante o trial + Termos de Uso e Política de Reembolso. |
| 7 | Cartão recusado no teste | A conta recém-criada é apagada (`auth.admin.deleteUser`) para o e-mail poder tentar outro cartão; a decisão 14 (a conta fica) vale só para o funil pago. |

## 3. Mecanismo escolhido no Mercado Pago

`POST /preapproval` sem plano aceita `auto_recurring.start_date` (ISO 8601): o MP valida o cartão
na criação (pode fazer cobrança simbólica com estorno automático) e agenda a **primeira cobrança
para `start_date`**; `next_payment_date` da resposta vem igual a `start_date`. A cobrança do 8º
dia chega pelo webhook `subscription_authorized_payment`, já tratado por `renew_subscription`.

Alternativas descartadas: guardar cartão em customer/card do MP e criar o preapproval no 8º dia via
pg_cron (mais peças, token de cartão expira); `auto_recurring.free_trial` (só documentado para
assinaturas com `preapproval_plan_id`, que não usamos).

**Confirmado no sandbox em 2026-09-15** (`POST /preapproval` via curl com as credenciais STAGING,
Visa de teste `4235 6477 2802 5682`, titular `APRO`, comprador `BUYER_TEST_EMAIL_MP`):

- HTTP 201, `status: authorized`, `next_payment_date` igual ao `start_date` enviado (D+7).
- O MP normaliza o `start_date` futuro em `auto_recurring.free_trial { frequency: 7,
  frequency_type: "days", first_invoice_offset: 7 }` na resposta; nada disso precisa ser enviado.
- `GET /authorized_payments/search?preapproval_id=…` devolve 0 linhas; `summarized.charged_quantity`
  nulo. Nenhuma cobrança imediata.
- Aparece 1 pagamento `operation_type: card_validation`, `transaction_amount: 0`, `approved`. Ele
  não carrega `external_reference` de compra, então o `mp-webhook` já o ignora (`purchaseRef`
  nulo) e ele nunca vira `subscription_invoices`.
- O preapproval `48cada46fb9a4cc79862003c314cff8a` ficou **vivo** no sandbox para observar a
  cobrança do 8º dia (2026-09-22): deve chegar como `subscription_authorized_payment`. Cancelar
  depois de conferir (`PUT /preapproval/{id} { status: "cancelled" }`).

Restrições do MP descobertas no spike (valem para o código):

- **`reason` tem no máximo 60 caracteres** (400 `reason has more than 60 characters`). O texto da
  seção 6 foi encurtado e o builder corta em 60.
- **Mastercard de teste `5031 4332 1540 6351` é recusada para recorrência**
  (`Unsupported_credit_card_for_recurring_payment`); usar a Visa acima no sandbox.
- **`payer_email` precisa ser um usuário de teste MLB real**: e-mail inventado dá `User bad
  request`, e-mail de teste de outro site dá `Payer is associated with a different site`, e o
  vendedor de teste não pode pagar a si mesmo. O comprador de teste criado para isso está em
  `BUYER_TEST_EMAIL_MP` (bloco STAGING do `.env`); a senha dele não foi guardada (só a API usa).

Estorno: `POST /v1/payments/{mp_payment_id}/refunds` (integral) com `X-Idempotency-Key =
"refund:" + invoice.id`. `mp_payment_id` já é espelhado em `subscription_invoices`.

## 4. Modelo de dados (migration única)

**`subscriptions`**

| coluna nova | tipo | nota |
|-------------|------|------|
| trial_ends_at | timestamptz null | = `start_date` enviado ao MP. Não nulo ⇒ nasceu como trial com cartão. |

**`subscription_invoices`**

| coluna nova | tipo | nota |
|-------------|------|------|
| refunded_at | timestamptz null | preenchido pelo `refund-last-charge`; uma linha só pode ser estornada uma vez |
| mp_refund_id | text null | id devolvido pelo MP |

**`profiles`**: sem coluna nova. `access_kind = 'trial'` + `trial_started_at` continuam sendo a
verdade do trial; a diferença entre "trial (cartão)" e "trial (convite)" é a existência de uma
`subscriptions` viva com `trial_ends_at`.

**`credit_transactions.type`**: ganha `refund_clawback`.

Índice: **não é preciso** um índice novo: `idx_subscription_invoices_subscription (subscription_id,
debit_date DESC)` já serve a busca da última cobrança (poucas linhas por assinatura).

## 5. Regras de crédito (RPCs `SECURITY DEFINER`, `service_role` only)

- **`trial_used_by_cpf(p_cpf text) → boolean`**: `EXISTS profiles p WHERE p.cpf = p_cpf AND
  (p.trial_started_at IS NOT NULL OR EXISTS subscriptions s WHERE s.user_id = p.id)`. Usada pelo
  `subscribe` antes de criar a conta.
- **A linha carrega a intenção** (ajuste de 2026-09-15, plano): `subscribe` grava
  `subscriptions.trial_ends_at` **no INSERT da linha `pending`** (o mesmo valor enviado como
  `start_date`). Assim nenhuma RPC muda de assinatura: `activate_subscription` (mesmos 6
  parâmetros, `CREATE OR REPLACE`) **ramifica pela coluna**, e o caminho do webhook
  (`sync_subscription_status` → `activate_subscription`) ativa um trial deixado `pending` sem
  saber que é trial. Um `DEFAULT NULL` novo na assinatura antiga criaria sobrecarga ambígua
  ("function is not unique") e exigiria `DROP` + refazer a ACL.
- **`activate_subscription`**, quando `trial_ends_at IS NOT NULL`: `current_period_end =
  trial_ends_at`, `first_payment_confirmed` fica `false`, **não** chama `apply_plan_quota` nem
  grava a invoice sintética `activation:`; em vez disso fecha o que sobrou no balde (`plan_reset`,
  se > 0), faz `profiles.access_kind = 'trial'`, `trial_started_at = now()`, `plan_credits = 50`,
  `plan_period_start = now()`, `plan_period_end = trial_ends_at`, ledger `trial_grant` (bucket
  `plan`, `ref_id` = assinatura), e devolve `{ success, already: false, trial: true, plan_credits:
  50, plan_period_end }`. Idempotente pelo mesmo guard de status já existente. Sem
  `trial_ends_at` o comportamento é o atual.
- **`renew_subscription`** (1ª cobrança aprovada, `first_payment_confirmed = false`) numa linha
  com `trial_ends_at`: é o primeiro dinheiro, então **carrega a cota do plano** via
  `apply_plan_quota` (que fecha o resto dos 50 com `plan_reset` e põe `access_kind =
  'subscriber'`), abre o período (`debit_date + 1 mês`), marca `first_payment_confirmed = true` e
  devolve `result: 'trial_converted'` (o `mp-webhook` trata como `renewed` para o analytics:
  `subscription_renewed` com o valor do plano). Numa linha sem `trial_ends_at` nada muda (a cota
  já foi carregada na ativação). Cobrança recusada no 8º dia: `clawback_subscription` já
  existente zera o plano e fecha a assinatura; nenhuma mudança. **Guarda de fatura não liquidada**
  (migration `20260918000001`, item 1 do fix wave final): fatura com `status = 'scheduled'` ou
  `payment_status` em `pending`/`in_process`/`authorized` só é espelhada e devolve `pending`
  (nunca `clawback`/`past_due`), e uma fatura `approved` com `amount_brl = 0` (validação de
  cartão do MP) devolve `ignored` sem converter nem renovar nada.
- **`cancel_subscription_local`**: se `subscriptions.trial_ends_at IS NOT NULL AND
  first_payment_confirmed = false` (cancelou dentro do trial) ⇒ também `plan_credits = 0`,
  `plan_period_end = now()`, ledger `plan_reset` negativo com o que sobrou. Fora do trial mantém
  a regra atual (usa até o fim do período pago).
- **`refund_last_charge(p_user_id uuid) → jsonb`**: em transação, com `FOR UPDATE` na assinatura
  viva (ou a mais recente cancelada há menos de 30 dias):
  1. acha a última `subscription_invoices` com `payment_status = 'approved'`, `mp_payment_id`
     não nulo e `refunded_at IS NULL`; se não houver ⇒ `{ error: 'nothing_to_refund' }`;
  2. devolve `{ invoice_id, mp_payment_id, amount_brl }` para a edge function chamar o MP;
  3. a confirmação vem por **`confirm_refund(p_invoice_id, p_mp_refund_id)`**: marca
     `refunded_at`, `mp_refund_id`; `plan_credits = 0`, `plan_period_end = now()`, ledger
     `refund_clawback` negativo com o saldo restante do plano (extras intocados);
     `cancel_subscription_local` (o preapproval é cancelado no MP pela edge function antes).
  Nunca estorna a cobrança de validação do MP (não vira invoice) nem mais de uma invoice.

## 6. Edge functions

**`subscribe`** (`_shared/subscribeInput.ts` + `subscribeFlow.ts`):

- body ganha `trial?: boolean`. Com `trial: true`: `planSlug` é ignorado e o plano é o **mais
  barato ativo, não `admin_only`** (`ORDER BY price_brl ASC LIMIT 1`); nunca vem do cliente.
- só no funil anônimo. Usuário já logado com `trial: true` ⇒ 400 `trial_requires_new_account`
  (quem tem conta assina pago em `/assinar`).
- antes de `createUser`: `trial_used_by_cpf(cpf)` ⇒ 409 `trial_used` (a UI troca o texto para
  "esse CPF já usou o teste" e oferece o botão "Assinar R$ 39,90/mês" no mesmo formulário, sem
  recarregar o cartão). E-mail duplicado continua 409 `email_exists`.
- a conta é criada com `access_kind = 'subscriber'` (o trigger `start_trial_on_confirm` não
  dispara para `subscriber`), para que **nenhum crédito exista antes do cartão ser aceito**.
- `buildPreapprovalBody` ganha `startDate?: string`; com trial, `auto_recurring.start_date =
  now + 7 dias` (ISO, UTC) e `reason = "Teste 7 dias + ${plan.name} - Olhar Singular"`. O
  builder corta o `reason` em **60 caracteres** (limite do MP, seção 3) em todos os casos, com
  teste unitário cobrindo o corte.
- `insertSubscription` grava `trial_ends_at = start_date`; `authorized` ⇒ o mesmo
  `activate_subscription` de sempre (ramifica pela coluna, seção 5); `pending` e `rejected` seguem
  o fluxo pago atual (sem crédito, sem sessão no `rejected`).
- **exceção no `rejected` do teste** (decisão 7, fix wave final): quando `trial && accountCreated`,
  `runAnonymousCheckout` apaga a conta recém-criada (`auth.admin.deleteUser`) antes de responder,
  para o mesmo e-mail poder tentar outro cartão em vez de travar em `email_exists`; falha ao
  apagar mantém a conta e loga um ALERT. A decisão 14 (a conta fica num `rejected`) segue valendo
  só para o funil pago.
- CPF inválido ou ausente com `trial: true` ⇒ 400 `cpf_required` (sem CPF não há como aplicar a
  decisão 4; o Brick sempre o envia, só um caller scriptado cai aqui).
- o resultado de `runSubscribe` passa a carregar `planSlug` e `priceBrl` (o servidor escolheu o
  plano, então é ele quem diz qual foi; o `index.ts` usa isso no analytics em vez de reconsultar).
- resposta ganha `trialEndsAt` (ISO, camelCase como o resto do contrato JSON) para a UI mostrar
  a data.
- analytics: evento `trial_started` (servidor), com o mesmo shape de `subscription_started`.

**`refund-last-charge`** (nova; `verify_jwt = true`; `index.ts` só monta `deps` e chama
`runRefundLastCharge` puro em `_shared/refundFlow.ts`, no padrão de `cancel-subscription`):

1. `refund_last_charge(user)` ⇒ `nothing_to_refund` vira 409;
2. `POST /v1/payments/{mp_payment_id}/refunds` com idempotência; não-2xx ⇒ 502 sem tocar no
   banco (o usuário pode tentar de novo);
3. `PUT /preapproval/{id} { status: 'cancelled' }` (best effort, log em falha: o próximo webhook
   `subscription_preapproval` sincroniza);
4. `confirm_refund(invoice_id, refund_id)`;
5. resposta `{ amountBrl, refundedAt, subscriptionId }` (camelCase como o resto do contrato JSON);
   analytics `refund` (nome já existente no `AnalyticsEventName`, Meta `Refund`), com o valor.
6. **Só o próprio usuário** (JWT); sem `userId` de admin nesta rodada. Elegibilidade: assinatura
   viva, ou a mais recente `cancelled` com `cancelled_at` há menos de 30 dias. Idempotência:
   `X-Idempotency-Key = "refund:" + invoice.id` no MP e `confirm_refund` no-op quando
   `refunded_at` já existe; um replay depois de um `confirm_refund` que falhou repete o POST com
   a mesma chave e confirma. O endpoint de estorno não pôde ser validado no sandbox em 2026-09-18
   (o token de teste não cria pagamentos avulsos e ainda não há cobrança de assinatura): a
   validação real é em 22/09, estornando a cobrança do 8º dia do preapproval `48cada46…`. Falha
   segura: MP não-2xx ⇒ 502 sem escrita, o usuário tenta de novo.

**`mp-webhook`**: sem mudança de contrato. Um `payment` com `status = 'refunded'` de um
`mp_payment_id` que já tem `refunded_at` é ignorado com log (idempotência).

**`cancel-subscription`**: sem mudança; a regra do trial mora na RPC.

## 7. Frontend

- **`PricingSection`**: card Teste vira "Teste grátis · 7 dias · 50 créditos"; linha fixa
  "Cartão obrigatório. Nada é cobrado por 7 dias; depois R$ {preço do plano mais barato}/mês
  ({cota} créditos). Cancele antes e não paga nada." Botão "Testar 7 dias grátis" →
  `/assinar?trial=1`. Some "Sem cartão: a equipe libera o convite" e o `mailto`.
- **`FaqSection`**: nova pergunta "Como funciona o teste grátis de 7 dias?" (cartão exigido e
  validado, possível cobrança simbólica estornada, 50 créditos, 8º dia cobra R$ 39,90 e a cota
  vira 300/mês, cancelar antes do 8º dia = nada cobrado e acesso encerra na hora, um teste por
  CPF). "Posso cancelar quando quiser?" ganha a exceção do trial. "E se eu me arrepender?" passa
  a descrever o estorno em autoatendimento (última cobrança, zera os créditos do plano, extras
  ficam, botão em Créditos).
- **`SubscribePage`** com `?trial=1`: título "Teste grátis por 7 dias", plano travado no mais
  barato (sem seletor), caixa fixa acima do botão: "Hoje: R$ 0,00. Em {data} cobramos R$ 39,90
  no cartão e seu plano vira 300 créditos/mês. Cancele antes em Créditos e nada é cobrado. Uma
  cobrança de validação pode aparecer e é estornada." Botão "Começar o teste". `trial_used` ⇒
  mensagem + botão que reenvia o mesmo formulário sem `trial`.
- **`SubscriptionCard`** (Créditos): estado `trial` com assinatura viva mostra "Teste grátis até
  {data} · 1ª cobrança de R$ 39,90 em {data} no cartão final {4 dígitos} · Cancelar agora
  encerra o acesso na hora e nada é cobrado" + botão Cancelar existente (confirmação com esse
  texto). Estado assinante com última cobrança estornável mostra botão **"Pedir estorno da
  última cobrança"** com diálogo: "Devolvemos R$ {valor} no mesmo cartão (até 2 faturas), os
  {n} créditos restantes do plano são removidos e a assinatura é cancelada. Os créditos extras
  ficam." Depois do estorno o card mostra "Estorno de R$ {valor} solicitado em {data}".
- **`Layout`** (faixa de estado): trial com cartão mostra "Teste grátis: {n} dias · cobra em
  {data}" em vez de "X dias de teste".
- **Extrato** (`CreditsPage`): rótulo para `refund_clawback` = "Créditos removidos pelo estorno".
- Hook novo `useRefundLastCharge` (mutation + invalidação de `credits`/`subscription`), no padrão
  de `useCancelSubscription`.

## 8. Textos legais (`legalDocs.ts`)

- **Termos de Uso**: cláusula "Teste grátis": cartão obrigatório, 7 dias sem cobrança, cobrança
  automática do plano mais barato no 8º dia salvo cancelamento, um teste por CPF, créditos do
  teste expiram no cancelamento ou no 8º dia.
- **Política de Reembolso**: §1 e §3 reescritos: estorno em autoatendimento em Créditos, sempre
  disponível para a **última cobrança**, integral, remove os créditos do plano daquele mês,
  cancela a assinatura, extras intocados; cobranças anteriores não são estornadas. Some a
  referência a e-mail (item 6 da lista original de remoção).
- **Política de Privacidade §6**: canal LGPD passa a ser o menu da conta ("Suporte → Entrar em
  contato") em vez do e-mail no texto. *(Decisão pendente do dono: o menu ainda usa
  `SUPPORT_EMAIL`; se o e-mail sair do menu também, o canal LGPD precisa de outro destino.)*

## 9. Admin

- Tabela de usuários: o estado "Teste" separa **"Teste (cartão)"** (assinatura viva com
  `trial_ends_at` e `first_payment_confirmed = false`) de **"Teste (convite)"**; o filtro segue os
  estados.
- Nova coluna/ação de leitura: última invoice aprovada (valor, data) e se foi estornada
  (`refunded_at`). Sem ação de estorno manual nesta rodada (o painel do MP continua servindo).
- **Estender teste com cartão: não existe** (decidido em 2026-09-18 após spike no sandbox: `PUT
  /preapproval/{id}` com `auto_recurring.start_date` ou `free_trial` responde 200 e ignora; pausar
  não move `next_payment_date`; o MP cobra no dia 8 de qualquer jeito). `admin_extend_trial`
  devolve `{ success: false, error: 'card_trial' }` quando o usuário tem uma assinatura viva com
  `trial_ends_at` não nulo e `first_payment_confirmed = false`; a UI desabilita "Estender" e explica:
  para dar mais tempo, conceda créditos extras ou cancele o teste.

## 10. Segurança

- Plano do trial decidido no servidor; `start_date` calculado no servidor.
- `trial_used_by_cpf` roda antes de criar a conta: um CPF barrado não deixa conta órfã.
- `refund-last-charge` exige JWT e opera só na assinatura do `auth.uid()`; a RPC trava a linha
  (`FOR UPDATE`) e a idempotência do MP usa o id da invoice, então duplo clique não estorna duas
  vezes.
- Nenhum crédito é concedido antes do preapproval `authorized`.

## 11. Testes

- **pgTAP** (`supabase/tests/database/`): `trial_with_card.test.sql` (`activate_subscription`
  com `p_trial_ends_at`: 50 créditos, `access_kind = 'trial'`, idempotência; `renew` da 1ª
  cobrança vira `subscriber` com 300; cobrança recusada ⇒ clawback; cancelar no trial zera na
  hora; cancelar fora do trial mantém; `trial_used_by_cpf` nos 3 casos). `refund.test.sql`
  (`refund_last_charge` acha a última aprovada; `nothing_to_refund`; `confirm_refund` zera o
  plano, preserva extras, cancela, é idempotente; ledger `refund_clawback`).
- **Vitest** (gate 100%): `subscribeInput` (`trial`), `subscribeFlow` (plano forçado,
  `start_date`, `trial_used`, `trial_requires_new_account`, `activate` com `trialEndsAt`),
  `mpPreapproval.buildPreapprovalBody` (`start_date`), `refundFlow` (ordem MP → cancel →
  confirm; 502 sem escrita; idempotência), `PricingSection`, `FaqSection`, `SubscribePage`
  (`?trial=1`, `trial_used`), `SubscriptionCard` (trial com cartão; botão de estorno; diálogo),
  `useRefundLastCharge`, `legalDocs`.
- **Sandbox real** (seção 3) antes de qualquer deploy.

## 12. Fases (commits na `main`, cada uma com TDD e aprovação do dono)

**Rodada 1 (decidida em 2026-09-15): só o teste com cartão.** Entra o que é trial; o estorno em
autoatendimento (objetivo 3, decisão 5, seções 5 `refund_last_charge`/`confirm_refund`, 6
`refund-last-charge`, o botão de estorno, o rótulo `refund_clawback`, a reescrita da Política de
Reembolso e o Admin) fica para a rodada 2, com plano próprio. Consequência aceita: até a rodada 2
a Política de Reembolso continua com o texto atual (inclusive a referência a e-mail).

1. Migration + RPCs do trial + pgTAP (seção 4 sem `refunded_at`/`mp_refund_id`/índice de
   invoices; seção 5 sem as RPCs de estorno).
2. `subscribe` com trial + `mpPreapproval.start_date` + testes.
3. Frontend do trial: landing (Pricing, FAQ), `SubscribePage?trial=1`, `SubscriptionCard`
   (estado trial), `Layout`, cláusula "Teste grátis" nos Termos de Uso.
4. Validação em sandbox (`make fn-serve-mp-test`, comprador `BUYER_TEST_EMAIL_MP`) + runbook de
   deploy (nunca sem o dono).

Rodada 1 implementada em 2026-09-15 (commits na `main`).

**Rodada 2 (plano `docs/superpowers/plans/2026-09-18-trial-rodada2-estorno-admin.md`):**
`refund-last-charge` + `refundFlow` + RPCs de estorno + UI/legal do estorno + Admin (estados
"Teste (cartão)"/"Teste (convite)", última cobrança) + `admin_extend_trial` recusando trial com cartão.

Rodada 2 implementada em 2026-09-18 (commits na `main`).

## 13. Riscos e pendências

- ~~Comportamento exato do `start_date` no MP~~: confirmado em sandbox (seção 3). Falta só
  observar a cobrança do 8º dia no preapproval deixado vivo (2026-09-22).
- Cobrança simbólica de validação: é do MP, não configurável; está nos textos. No sandbox veio
  R$ 0,00; em produção pode ser um valor pequeno estornado automaticamente.
- Fuso: `start_date` em UTC; a data exibida usa `America/Sao_Paulo`. Um trial iniciado 23h
  pode mostrar "cobra em D+8" localmente; aceitável.
- `SUPPORT_EMAIL` ainda vive no menu da conta e na Privacidade; decisão do dono sobre remover
  do menu fica fora deste spec.
- Estorno via API do MP em cartão pode levar até 2 faturas; o texto avisa.
