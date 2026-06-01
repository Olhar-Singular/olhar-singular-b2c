# Stripe (cartão de crédito) + Mercado Pago (Pix) — Design

**Data:** 2026-06-01
**Status:** Aprovado para implementação

## Objetivo

Adicionar pagamento por **cartão de crédito via Stripe Checkout (hospedado)** para compra
de pacotes de crédito, mantendo o **Mercado Pago restrito a Pix**. Escopo desta entrega:
apenas cartão de crédito, em **BRL, modo de teste** (`sk_test_…`).

## Decisões travadas

| Decisão | Escolha |
|---|---|
| Convivência com MP | MP vira **só Pix**; Stripe assume **cartão** |
| Tipo de integração Stripe | **Stripe Checkout hospedado** (redirect, espelha o fluxo MP atual) |
| Moeda / ambiente | **BRL, modo de teste** |
| Coluna `provider` em `credit_purchases` | **Incluir** (rotula Pix x Cartão) |

## Contexto do código existente (reaproveitado)

O projeto já tem um fluxo de pagamento completo e funcional via Mercado Pago:

- Tabelas `public.credit_purchases` (pending→approved, escrita só por `service_role`) e
  `public.credit_transactions` (imutável, append-only).
- RPC `public.grant_credits(p_user_id, p_amount, p_type, p_payment_id, p_ref_id)` —
  concede créditos atomicamente e registra a transação. `type='purchase'`.
- `payment_id` é `TEXT` e **agnóstico de provedor** → Stripe encaixa sem mudança de lógica.
- Edge functions seguem padrão: CORS compartilhado, auth via Bearer token, `userClient`
  (anon + Authorization) para identificar o usuário e `admin` (service_role) para escrever.
- Padrão de teste: utilitários puros em `supabase/functions/_shared/*.ts` são testados com
  Vitest; os **handlers `serve()` não têm teste** (importam de deno.land/esm.sh).

## Arquitetura

```
Usuário clica "Cartão de crédito" em um pacote
  └─ useCreateStripeCheckout → invoke("create-stripe-checkout")
        └─ edge create-stripe-checkout:
             - auth (Bearer) → user
             - findPackage(credits, amountBrl)  [módulo compartilhado]
             - insert credit_purchases(status=pending, provider='stripe')
             - Stripe Checkout Session (mode=payment, payment_method_types=['card'], BRL)
               client_reference_id = purchase.id ; customer_email = user.email
             - retorna { url: session.url }
        └─ window.location.href = url   (Stripe hospeda o pagamento)

Stripe → webhook "checkout.session.completed"
  └─ edge stripe-webhook:
        - lê corpo cru + header stripe-signature
        - stripe.webhooks.constructEventAsync(...)  (verificação de assinatura)
        - extractCheckoutGrant(event)  [módulo compartilhado]
             → null se não for completed / não estiver "paid"
             → { purchaseId, paymentId } caso pago
        - update credit_purchases → approved (idempotente: .eq status 'pending')
        - grant_credits RPC (type='purchase')
        - retorna { received: true }

Usuário é redirecionado para /creditos/sucesso
```

O schema de banco e a RPC `grant_credits` são reaproveitados sem mudança de lógica.
`payment_id` guarda o `payment_intent` da Stripe.

## Componentes

### Novos — edge handlers

- **`supabase/functions/create-stripe-checkout/index.ts`**
  Gêmeo de `create-checkout`. Diferenças: cria Stripe Checkout Session (SDK Deno) em vez
  de preferência MP; grava `provider='stripe'` no insert pending.

- **`supabase/functions/stripe-webhook/index.ts`**
  Gêmeo de `mp-webhook`. Verifica assinatura com o SDK Stripe
  (`constructEventAsync` + `Stripe.createSubtleCryptoProvider()`); usa `extractCheckoutGrant`
  para decidir; faz o mesmo update idempotente + `grant_credits`.

### Novos — lógica pura testável (garante a cobertura)

- **`supabase/functions/_shared/creditPackages.ts`**
  - `ALLOWED_PACKAGES` — única fonte da verdade dos pacotes (30/9,90 · 120/29,90 · 300/59,90).
  - `findPackage(credits, amountBrl)` — retorna o pacote ou `null` (tolerância de centavos < 0,01).
  - **Importado por `create-checkout` e `create-stripe-checkout`**, eliminando a whitelist duplicada.

- **`supabase/functions/_shared/stripeEvents.ts`**
  - `extractCheckoutGrant(event)` — dado o evento Stripe, retorna
    `{ purchaseId: string; paymentId: string } | null`. Regras:
    - `event.type !== "checkout.session.completed"` → `null`
    - `session.payment_status !== "paid"` → `null`
    - sem `client_reference_id` → `null`
    - caso ok → `{ purchaseId: session.client_reference_id, paymentId: session.payment_intent ?? session.id }`

### Alterações

- **`supabase/functions/create-checkout/index.ts`**
  - Usa `findPackage` do módulo compartilhado (remove `ALLOWED_PACKAGES` local).
  - `payment_methods.excluded_payment_types` para excluir cartão/débito/ticket →
    **MP fica só Pix** (`bank_transfer`). Mantém `installments: 1`.

- **`src/hooks/useCredits.ts`**
  - Adiciona `useCreateStripeCheckout()` espelhando `useCreateCheckout` (invoca
    `create-stripe-checkout`, redireciona em `onSuccess`, `toast.error` em `onError`).

- **`src/pages/CreditsPage.tsx`**
  - Cada pacote ganha **2 botões**: "Cartão de crédito" (Stripe, primário) e "Pix"
    (Mercado Pago, secundário).
  - Atualiza o texto do rodapé (hoje "PIX ou cartão via Mercado Pago").

### Migration

- **`supabase/migrations/<timestamp>_add_provider_to_credit_purchases.sql`**
  - `ALTER TABLE public.credit_purchases ADD COLUMN provider TEXT NOT NULL DEFAULT 'mercadopago';`
  - Backfill automático via default (linhas antigas + MP = `'mercadopago'`).
  - `CHECK (provider IN ('mercadopago', 'stripe'))`.
  - **RLS inalterada** (escrita continua só por `service_role`).
  - Regenerar `src/integrations/supabase/types.ts` após aplicar.

### Configuração de infraestrutura

- **`supabase/config.toml`** — adicionar `[functions.stripe-webhook] verify_jwt = false`
  (e o mesmo para `mp-webhook`). Webhooks são chamados pelo provedor sem JWT do Supabase;
  com o default `verify_jwt = true` o gateway rejeita a chamada com **401 antes da função
  rodar**. Sem isto o webhook nunca executa.
- **`Makefile`** — incluir `create-stripe-checkout` e `stripe-webhook` na lista `FUNCTIONS`
  (usada por `make fn-deploy-all`). O CI (`supabase.yml`) itera todas as pastas, mas o deploy
  local depende dessa lista.

### Variáveis de ambiente novas (edge functions)

- `STRIPE_SECRET_KEY` — `sk_test_…`
- `STRIPE_WEBHOOK_SECRET` — `whsec_…` (do `stripe listen` / dashboard)

Adicionar ao `supabase/functions/.env.example`. No remoto: `supabase secrets set …`.

### Pré-requisitos de deploy / teste no servidor

1. Aplicar a migration `provider` no remoto (`db push`) — **obrigatória**: sem a coluna,
   o INSERT em `credit_purchases` (tanto Stripe quanto MP) falha.
2. `supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=…` no projeto remoto.
3. Registrar o endpoint no **Stripe Dashboard → Webhooks**: URL
   `https://<project-ref>.functions.supabase.co/stripe-webhook`, evento
   `checkout.session.completed`. Copiar o `whsec_…` gerado para `STRIPE_WEBHOOK_SECRET`.
4. Deploy das functions (`create-stripe-checkout`, `stripe-webhook`, e redeploy de
   `create-checkout` e `mp-webhook` para aplicar `verify_jwt`/provider).
5. Regenerar `types.ts` (`make gen-types-remote`) — o CI faz isso no push de `supabase/**`.

### Limitação conhecida (herdada do fluxo Mercado Pago)

Se `grant_credits` falhar **após** a compra ser marcada `approved`, o retry do webhook não
re-concede (o `UPDATE … WHERE status='pending'` não casa mais) e os créditos não entram.
O `stripe-webhook` espelha exatamente esse comportamento do `mp-webhook` — não introduz
inconsistência nova. Mitigação fica fora do escopo desta entrega (apenas cartão agora).

## Estratégia de testes (Vitest)

| Arquivo de teste | Cobre |
|---|---|
| `supabase/functions/_shared/creditPackages.test.ts` | aceita os 3 pacotes válidos; rejeita crédito inexistente, preço divergente, combinação inválida |
| `supabase/functions/_shared/stripeEvents.test.ts` | `extractCheckoutGrant`: `null` para tipo errado, `null` para `payment_status='unpaid'`, `null` sem `client_reference_id`, retorna ids quando `paid` |
| `src/hooks/useCredits.test.ts` | `useCreateStripeCheckout`: invoca `create-stripe-checkout` com o body certo; redireciona em sucesso; dispara `toast.error` em erro |
| `src/pages/CreditsPage.test.tsx` | renderiza os 2 botões por pacote; clicar "Cartão" chama o mutation Stripe com o pacote certo; clicar "Pix" chama o mutation MP |

**Handlers `serve()`** (`create-stripe-checkout`, `stripe-webhook`) **não** rodam em Vitest —
mesma realidade dos handlers MP. Eles ficam finos (só orquestram os módulos puros já testados).
Verificação ponta-a-ponta documentada via **Stripe CLI**:

```bash
stripe login
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

## Fora de escopo (YAGNI nesta entrega)

- Pix/boleto via Stripe; parcelamento; assinaturas/recorrência.
- Stripe Elements/Payment Element embutido (ficou Checkout hospedado).
- Modo produção / chaves live (fica em modo teste agora).
- Reembolso automatizado via Stripe.

## Fluxo TDD

Cada unidade segue Red → Green → Refactor: primeiro o teste que falha
(`creditPackages`, `stripeEvents`, hook, página), depois a implementação mínima,
depois limpeza com lint + testes verdes.
