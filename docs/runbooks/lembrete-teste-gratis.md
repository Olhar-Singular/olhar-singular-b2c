# Runbook: lembrete 48 h antes da primeira cobrança do teste grátis

O que o dono faz em produção, em ordem, para o lembrete funcionar. Nada disto é
feito por agente nem por migration: segredos só pelo Dashboard ou pela CLI do dono.

Peças (já no repositório):

- Migration `supabase/migrations/20261013233000_trial_reminders.sql`: coluna
  `subscriptions.trial_reminder_sent_at`, RPCs `claim_trial_reminders(p_window)` e
  `release_trial_reminder(id)` (só `service_role`), função `invoke_send_trial_reminders()`
  e o job `send-trial-reminders` do pg_cron (`5 * * * *`, toda hora no minuto 5).
- Edge function `supabase/functions/send-trial-reminders` (`verify_jwt = false`): exige
  `Authorization: Bearer <CRON_SECRET>`; lógica em `_shared/trialReminder.ts`.
- E-mail via Resend (`_shared/email.ts`); sem `RESEND_API_KEY` cada tentativa falha com
  `not_configured`, a linha é liberada e a próxima hora tenta de novo.

## 1. Secrets das edge functions

No Dashboard (Edge Functions → Secrets) ou pela CLI, criar:

| Secret | Valor |
| --- | --- |
| `RESEND_API_KEY` | API key do Resend (`re_...`) de um domínio verificado (SPF/DKIM) |
| `EMAIL_FROM` | opcional; `Nome <endereço>`; padrão `Olhar Singular <contato@olharsingular.com>` |
| `CRON_SECRET` | string longa e aleatória (ex.: `openssl rand -hex 32`); só o pg_cron e o dono a conhecem |

`APP_URL` já existe (links do e-mail). Sem `CRON_SECRET` a função responde 500 e loga
`CRON_SECRET not set`.

**Verify JWT desligado no Dashboard.** O `verify_jwt = false` do `config.toml` só vale quando a
function é publicada pela CLI ou pela Action. Confira em Edge Functions → send-trial-reminders →
Details que "Verify JWT" está desligado; ligado, o gateway devolve 401 ao pg_net antes de a função
rodar e o lembrete nunca sai (o `status_code` 401 aparece em `net._http_response`).

## 2. Segredos no Vault (banco)

No SQL Editor, como `postgres`, uma vez cada:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'functions_url');
select vault.create_secret('<o mesmo valor de CRON_SECRET>', 'cron_secret');
```

`functions_url` sem barra final. Para trocar um valor depois: `select vault.update_secret(id, '<novo>')`
com o `id` de `select id, name from vault.secrets`.

Onde o segredo circula: `invoke_send_trial_reminders()` passa o bearer como parâmetro (não
entra no texto do SQL, logo não vaza em mensagens de erro), mas o pg_net guarda os headers de
cada chamada em `net.http_request_queue` até despachar e o par pedido/resposta em
`net._http_response`. São tabelas só de administrador (nunca expostas pela API); ao trocar o
`CRON_SECRET`, troque também o `cron_secret` do Vault.

## 3. Conferir o agendamento

```sql
select jobid, jobname, schedule, command, active from cron.job where jobname = 'send-trial-reminders';
```

Deve haver uma linha com `5 * * * *` e `SELECT public.invoke_send_trial_reminders();`. Se não
houver, pg_cron não existia na hora do `db push`: habilite pg_cron e pg_net em Database →
Extensions e rode o bloco `DO $$ ... $$` final da migration no SQL Editor.

## 4. Conferir a primeira execução (depois de passar o minuto 5 de alguma hora)

```sql
-- o cron rodou?
select start_time, status, return_message
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'send-trial-reminders')
 order by start_time desc limit 5;

-- o pg_net entregou? (status_code 200 = a função rodou; 401 = CRON_SECRET diferente do Vault; 500 = ver logs da função)
select id, created, status_code, content
  from net._http_response
 order by created desc limit 5;
```

Nos logs da function (Edge Functions → send-trial-reminders → Logs) a linha
`send-trial-reminders: run finished { claimed, sent, failed }` resume cada hora. Com
`failed > 0`, `email: ...` logo acima diz o motivo (status HTTP do Resend, timeout,
`not_configured`); as linhas liberadas voltam na hora seguinte.

## 5. Teste manual (sem colar segredos em lugar nenhum)

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/send-trial-reminders" \
  -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}'
# → {"claimed":0,"sent":0,"failed":0} quando ninguém está a 48 h da cobrança
```

Sem o header: `401 {"error":"Não autorizado."}`. Com método GET: 405.

Para forçar um envio real de teste: uma assinatura em trial com `trial_ends_at` dentro de 48 h,
`first_payment_confirmed = false`, sem cancelamento e `trial_reminder_sent_at IS NULL`; depois
do envio, a linha fica marcada e não recebe de novo (reenviar exige
`select public.release_trial_reminder('<id>')`).

## Local (desenvolvimento)

`make sb-start`, `make fn-serve` e, com `CRON_SECRET` no `.env` raiz:

```bash
curl -s -X POST http://localhost:54321/functions/v1/send-trial-reminders \
  -H "Authorization: Bearer $CRON_SECRET" -d '{}'
```

Sem `RESEND_API_KEY` local a resposta conta `failed` e o log mostra `not_configured`: esperado.
pgTAP: `make test-db` (`supabase/tests/database/trial_reminders.test.sql`).
