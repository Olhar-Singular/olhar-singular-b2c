# Variáveis de Ambiente

As variáveis no `.env` (raiz) apontam para o **Supabase remoto** (produção). Use sempre
estes nomes ao referenciar credenciais remotas em scripts, edge functions, comandos ou
ferramentas — **nunca hardcode URLs/keys**.

```bash
VITE_SUPABASE_URL=             # URL do projeto remoto (ex.: https://<project-id>.supabase.co)
VITE_SUPABASE_PUBLISHABLE_KEY= # Anon/publishable key (uso client-side)
VITE_SUPABASE_PROJECT_ID=      # ID do projeto remoto (usado pelo MCP supabase e pelo CLI)
```

Opcionais (descomentar quando precisar de acesso direto ao Postgres remoto, fora do client supabase-js):

```bash
DATABASE_PASSWORD=             # Senha do role postgres (remoto)
DATABASE_URL=                  # Connection string completa (remoto)
```

> **Um único `.env`** na raiz é a fonte de verdade: serve o app (Vite) **e** as edge
> functions locais (`make fn-serve` lê o `.env` raiz — não há mais `supabase/functions/.env`).
> Guarda também os segredos de backend (`AI_API_KEY`, `ACCESS_TOKEN_MP_PROD`,
> `VERIFY_TOKEN_MP_PROD`, `APP_URL`, `CHECKOUT_HASH_SECRET`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`,
> `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE` (opcional e transitório: só enquanto
> valida a CAPI na aba "Testar eventos"; setup do GTM em `docs/analytics-gtm-meta-pixel.md`),
> `RESEND_API_KEY` e `EMAIL_FROM` (e-mail transacional via Resend, `_shared/email.ts`: sem a
> chave nenhum e-mail sai e o envio vira um warn `not_configured`; `EMAIL_FROM` é o remetente
> "Nome <endereço>" num domínio verificado, padrão `Olhar Singular <contato@olharsingular.com>`),
> `CRON_SECRET` (bearer que o pg_cron apresenta, via pg_net e Vault, à function
> `send-trial-reminders`; `_shared/cronAuth.ts`; runbook `docs/runbooks/lembrete-teste-gratis.md`),
> `GOOGLE_CLIENT_*`, sem prefixo `VITE_`), a `VITE_GTM_ID` (container
> do GTM, injetado em runtime só fora do checkout; sem ela nenhum analytics carrega) e a
> `VITE_MP_PUBLIC_KEY` (public key do Mercado Pago da **mesma aplicação** do
> `ACCESS_TOKEN_MP_PROD`; vai pro bundle e inicializa o Card Payment Brick). O bloco
> STAGING (`ACCESS_TOKEN_MP`, `PUBLIC_KEY_MP`, `VERIFY_TOKEN_MP`, usuário de teste) é o
> vendedor de TESTE do MP, usado por `make fn-serve-mp-test`, e `BUYER_TEST_EMAIL_MP`, o
> comprador de teste usado como e-mail da conta no funil anônimo do sandbox (o link de
> acesso cai no Mailpit local). As `VITE_SUPABASE_*`
> servem aos dois ambientes — o que muda é o conteúdo.
>
> **Login com Google (OAuth):** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` alimentam o
> bloco `[auth.external.google]` do `config.toml` (via `env(...)`) — valem só no **Supabase
> LOCAL**. Em produção o provider Google é habilitado pelo Dashboard (Auth → Providers →
> Google) ou por PATCH na Management API; **nunca** `supabase config push` (apagaria o SMTP
> do Resend).
>
> Para apontar o app pro **Supabase local** sem editar o `.env`, a skill `validate-adaptar`
> cria um `.env.local` **efêmero** (o Vite prioriza, é gitignored) e o **remove no cleanup**
> (`rm -f .env.local`). Se você encontrar um `.env.local` solto na árvore, é resíduo de uma
> validação — pode apagar.

## Acesso ao Supabase remoto (referência rápida)

| Ferramenta              | Variável usada                                        |
| ----------------------- | ----------------------------------------------------- |
| MCP `supabase`          | `VITE_SUPABASE_PROJECT_ID`                            |
| `make sb-link`          | `VITE_SUPABASE_PROJECT_ID` (via Makefile)             |
| `make gen-types-remote` | `VITE_SUPABASE_PROJECT_ID`                            |
| Client supabase-js      | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Conexão Postgres direta | `DATABASE_URL` (ou `DATABASE_PASSWORD`)               |
