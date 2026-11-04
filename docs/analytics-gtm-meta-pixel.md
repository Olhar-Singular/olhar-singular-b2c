# Meta Pixel e Conversions API: o que o código faz e o que fica no GTM

Guia de configuração para quem administra o container do GTM e o Meta Business. O código
já emite os eventos; as tags e os segredos ficam fora do repositório.

## Como os dados chegam à Meta

| Origem | O que envia | Onde nasce |
| --- | --- | --- |
| **Browser (direto)** | `PageView` (uma por rota), `ViewContent` (planos exibidos na landing) e `InitiateCheckout` (clique em qualquer CTA de teste/assinar, com `origem`) | `src/lib/analytics/metaPixel.ts` carrega o `fbevents.js` com `VITE_META_PIXEL_ID`, sem GTM; **não espera o banner de cookies** (decisão do dono em 2026-11-04): envia em toda visita, aceite ou não |
| **Servidor (CAPI)** | `Subscribe`, `StartTrial`, `Purchase` (e `SubscriptionPaymentFailed`, `SubscriptionCancelled`, `Refund` como eventos personalizados) | `supabase/functions/_shared/analyticsEvents.ts`, chamado por `subscribe`, `create-card-payment`, `mp-webhook`, `cancel-subscription` e `refund-last-charge` |

A CAPI só liga quando `META_PIXEL_ID` **e** `META_CAPI_TOKEN` existem. Cada evento leva
`event_id` (id da compra ou da assinatura) para deduplicação. O e-mail só é enviado com hash e
só com `ad_user_data` concedido; `fbp`/`fbc` só com `ad_storage` concedido.

## Pré-requisitos (fora do repositório)

1. **`VITE_META_PIXEL_ID` no Vercel** (Production e Preview) e um novo build: liga o Pixel no
   navegador sem GTM (mesmo valor do `META_PIXEL_ID`; o id é público). `VITE_GTM_ID` é opcional e
   só serve para outras tags (GA4 etc.).
2. **Secrets no Supabase remoto**: `META_PIXEL_ID` e `META_CAPI_TOKEN`. O CI não cria secrets.
   Para validar, acrescente temporariamente `META_TEST_EVENT_CODE` e remova depois.
3. **Meta Business**: verificar o domínio `professor.olharsingular.com` e configurar a
   prioridade de eventos (Aggregated Event Measurement) para `Purchase`, `Subscribe`,
   `StartTrial` e `InitiateCheckout`.

## Container do GTM (opcional)

**Não crie tag do Meta Pixel no GTM**: o app já envia `PageView`, `ViewContent` e `InitiateCheckout` direto, e uma tag
igual no container duplicaria os eventos. O GTM continua recebendo `cta_click` no `dataLayer`
para GA4 ou outras tags.

Evento do `dataLayer` emitido pela landing:

```js
{ event: "cta_click", origem: "header" | "hero" | "planos" | "fechamento" | "barra-mobile" }
```

Se for usar `cta_click` em outra tag:

1. **Variável** de camada de dados `origem` (Data Layer Variable, versão 2).
2. **Acionador** "CTA clique": evento personalizado `cta_click`.
3. **Tag base** "Meta Pixel PageView": o Pixel do Meta com o ID do pixel, em All Pages.
   Em *Configurações de consentimento*, exigir `ad_storage` (e `ad_user_data` se usar
   correspondência avançada). Sem isso a tag dispara `PageView` antes do aceite.
4. (Não fazer, ver aviso acima) Tags Meta no GTM: o app já envia `InitiateCheckout` no clique dos CTAs.

O app inicia o Consent Mode v2 com tudo `denied` até o visitante decidir no banner
(`src/lib/analytics/consent.ts`); o GTM carrega antes da decisão, então o consentimento
exigido na tag é o que impede disparo antes do aceite.

## Aviso: `Subscribe`, `StartTrial` e `Purchase` vêm só do servidor

O GTM **não é injetado** em `/assinar` nem em `/definir-senha` (`src/lib/analytics/gtm.ts`),
onde o CSP do Brick de pagamento é estrito. Por isso o checkout inteiro só chega à Meta pela
CAPI, sem duplicata. Duas consequências:

- **Não crie tags de browser** para `subscription_started`, `trial_started` ou `purchase`.
- Se um dia criar, mapeie para `Subscribe`, `StartTrial` e `Purchase` e envie
  `eventID = {{event_id}}` (a Meta deduplica por nome do evento + `event_id`). Atenção: se o GTM
  já foi carregado numa rota anterior, ele continua carregado depois de uma navegação interna
  para `/assinar`, então esses eventos podem aparecer nos dois lados.

## Como validar

1. No Supabase remoto, setar `META_TEST_EVENT_CODE` com o código da aba **Testar eventos**
   do Gerenciador de Eventos (ou, localmente, no `.env`).
2. Disparar um evento (por exemplo, um teste com cartão em `make fn-serve-mp-test`) e conferir
   na aba que o evento chega com o `event_id` esperado.
3. **Remover `META_TEST_EVENT_CODE`** ao terminar: enquanto existir, todos os eventos de
   produção vão para a aba de teste e não contam para campanhas.
4. Para o lado do browser: abrir a landing com o Meta Pixel Helper, clicar em cada CTA (o banner não
   influencia o Pixel): `PageView`, `ViewContent` e `InitiateCheckout` (com `origem`) aparecem. 

## CSP

Nenhuma mudança é necessária. `script-src` já libera `https://connect.facebook.net` (script
`fbevents.js`), o beacon `/tr` do pixel passa por `img-src https:` e `connect-src` já tem
`https://www.facebook.com`. Não adicione hosts do GTM, do GA ou da Meta ao CSP de `/assinar`.
