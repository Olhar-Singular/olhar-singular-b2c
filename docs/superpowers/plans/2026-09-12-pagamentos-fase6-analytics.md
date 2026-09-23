# Fase 6: analytics (GTM, Consent Mode v2, atribuição, eventos server-side)

Spec: decisões 25 a 27, seções 4.5 (Analytics, CSP) e 4.9, seção 9 (Analytics). Estado ao final:
**com os IDs configurados, o funil é medido no cliente (GA4 via GTM, Pixel via GTM) e no servidor
(Measurement Protocol e CAPI), sempre depois do consentimento; sem IDs, tudo é no-op.**

## Task 1: `src/lib/analytics/`

- `consent.ts`: estado Consent Mode v2 (`analytics_storage`, `ad_storage`, `ad_user_data`,
  `ad_personalization`), `denied` por padrão, persistido em `localStorage` com versão do texto.
- `dataLayer.ts`: `pushEvent(name, params)` tolerante à ausência do GTM; `gtagConsent(...)`.
- `gtm.ts`: `loadGtm(id, pathname)` injeta o container só com `VITE_GTM_ID` e **nunca** em
  `/assinar` nem `/definir-senha` (a mesma origem recebe token de sessão, e-mail, CPF e cartão).
- `attribution.ts`: captura `utm_*`, `gclid`, `fbclid`, `referrer`, `landing_path` sempre; `_ga`,
  `_fbp`, `_fbc` só com `analytics_storage`/`ad_storage` concedidos; guarda em `sessionStorage` e
  anexa `consent` para o servidor.
- `events.ts`: `view_item_list`, `select_item`, `begin_checkout`, `add_payment_info`, `purchase`
  (cartão síncrono), `subscription_started`, `paywall_shown`, `consent_updated`; `event_id` = id da
  compra/assinatura (dedupe com o servidor). Nada de e-mail/CPF no `dataLayer`.
- `components/common/ConsentBanner.tsx` (`role="dialog"`, aceitar/recusar, sem trap de foco).
- `App.tsx`: `AnalyticsBoot` (defaults de consentimento, GTM por rota, atribuição na LP).

## Task 2: eventos nas telas

`PricingSection` (view_item_list uma vez), `SubscribePage` (select_item, begin_checkout,
add_payment_info, subscription_started; envia `attribution`), `CardPaymentDialog` (purchase
quando aprovado na hora), `AccessBanner` (paywall_shown ao mostrar a faixa de bloqueio).

## Task 3: `_shared/analyticsEvents.ts` + wiring

Builders puros GA4 MP e Meta CAPI (e-mail SHA-256 só com `ad_user_data` concedido; sem
`client_id` quando `analytics_storage` negado); `sendAnalyticsEvents(events, config, fetch)`
no-op sem `GA4_MEASUREMENT_ID`/`GA4_API_SECRET`/`META_PIXEL_ID`/`META_CAPI_TOKEN`, timeout 3s,
nunca lança. Chamadas: `subscribe` (subscription_started), `create-card-payment` e `mp-webhook`
(purchase, subscription_renewed, subscription_payment_failed), `cancel-subscription`
(subscription_cancelled).

## Task 4: CSP, env, docs

`vercel.json` (GTM/GA/Meta em script/connect/frame), `.env.example` (`VITE_GTM_ID`, secrets de
analytics), `environment.md`, `dominio-orientador`, `edge-fn-writer`; lint, coverage, fn-check.

## Estado (2026-09-12)

Tasks 1 a 4 concluídas num commit. Pendente: IDs reais (GTM, GA4, Pixel, CAPI) e a validação num
Preview do Vercel com o Network tab (Brick renderiza com a CSP, GTM carrega fora do checkout,
banner de consentimento) antes de mesclar.
