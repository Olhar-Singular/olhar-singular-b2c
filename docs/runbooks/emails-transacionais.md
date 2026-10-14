# Runbook: e-mails transacionais (confirmação da contratação e lembrete do teste)

Referência curta para o Suporte e para o dono: quais e-mails saem, de onde, como saber que
falharam e o que fazer. Provedor: Resend (`_shared/email.ts`), remetente `EMAIL_FROM`
(padrão `Olhar Singular <contato@olharsingular.com>`). Sem `RESEND_API_KEY` nenhum e-mail
sai e cada tentativa vira um aviso `not_configured` no log. Nunca há CPF, cartão ou link
mágico nesses e-mails: só nome, plano, valores, datas e links.

## Os três e-mails

| E-mail | Quando | De onde sai | Destinatário |
| --- | --- | --- | --- |
| Confirmação da contratação (comprovante) | Checkout com cartão **autorizado na hora** (plano pago ou teste grátis) | edge fn `subscribe` (`_shared/subscriptionEmails.ts`), em background, depois da resposta ao cliente | e-mail da conta (o mesmo do checkout) |
| Confirmação da contratação pelo webhook | Checkout que ficou **pendente** e o Mercado Pago autorizou depois (`activated`), ou assinatura fechada que **voltou a ser paga** (`reactivated`) | edge fn `mp-webhook` (`_shared/webhookConfirmation.ts`), em background, depois de responder ao MP | e-mail da conta (`auth.users`), `payer_email` do cartão como reserva |
| Lembrete da primeira cobrança do teste | Toda hora (minuto 5), para trials que terminam nas próximas 48 h | pg_cron → edge fn `send-trial-reminders` (`_shared/trialReminder.ts`) | e-mail da conta, `payer_email` como reserva |

Conteúdo da confirmação: plano, valor, créditos por mês, "cobrado hoje" ou a data da primeira
cobrança do teste, versão dos Termos aceita (quando a conta nasceu no checkout), links para
Termos, Privacidade, Reembolso e Créditos, data da contratação (na reativação, a data do
débito). Conteúdo do lembrete: data da cobrança, valor, plano, data limite para cancelar
(a véspera) e o link de Créditos. Detalhes do lembrete e do agendamento:
[lembrete-teste-gratis.md](./lembrete-teste-gratis.md).

Quem **não** recebe a confirmação pelo webhook: renovações mensais, a primeira cobrança de
uma assinatura que já foi autorizada no checkout (o e-mail saiu lá) e reprocessamentos da
mesma notificação.

## Como saber que um e-mail falhou (logs das edge functions, Dashboard → Edge Functions → Logs)

| Log | Significado |
| --- | --- |
| `subscribe: confirmation e-mail not sent <id da assinatura> <razão>` | A confirmação do checkout não saiu |
| `mp-webhook: confirmation e-mail not sent <id> <razão>` | A confirmação pelo webhook não saiu |
| `mp-webhook: confirmation e-mail skipped, subscription or plan not found <id>` | A linha não foi lida (investigar) |
| `mp-webhook: confirmation e-mail failed <id> <tipo do erro>` | Leitura ou envio lançou exceção |
| `trial-reminders: send failed, released <id> <razão>` | Lembrete não saiu; a linha foi liberada e a próxima hora tenta de novo |
| `trial-reminders: send threw, released <id> <tipo>` | Idem, com exceção |
| `trial-reminders: release failed, row stays claimed <id> <erro>` | Lembrete falhou E a liberação falhou: a linha fica marcada sem e-mail (ver abaixo) |
| `email: not configured (RESEND_API_KEY), skipping <assunto>` | Falta a chave do Resend |
| `email: endpoint answered <assunto> <status HTTP>` | O Resend recusou (422 = remetente/domínio não verificado é o mais comum) |

Razões possíveis: `not_configured`, `timeout`, `network_error`, `http_<status>`. Sucessos
ficam em `email: sent`, `subscribe`/`mp-webhook: confirmation e-mail sent` e
`trial-reminders: sent`, sempre só com o id da assinatura (nunca o e-mail da pessoa).

## Reenvio

**Não há reenvio automático da confirmação** (nem no checkout nem no webhook) e não há
ferramenta de reenvio hoje. Caminho honesto do Suporte quando um cliente não recebeu o
comprovante:

1. Confirmar nos logs acima que o envio falhou (ou que o e-mail da conta estava errado).
2. Responder ao cliente, pelo canal de Suporte, com os dados do contrato que aparecem na
   área **Créditos** da conta dele: plano, valor mensal, créditos por mês, data da próxima
   cobrança (ou do fim do teste) e os links para `/termos`, `/privacidade` e `/reembolso`.
   Esses dados também estão em `subscriptions` + `plans` (SQL Editor, como admin).
3. Se forem vários clientes (ex.: Resend fora do ar por horas), acionar o maestro para um
   script de reenvio em lote a partir do log; não existe ainda como rotina.

O **lembrete** tem reenvio automático: uma falha libera a linha e a próxima hora tenta de
novo, enquanto `trial_ends_at` ainda estiver no futuro. Para forçar um reenvio manual:
`select public.release_trial_reminder('<id>')` e esperar a próxima hora (ou chamar a function
com o `CRON_SECRET`, como no runbook do lembrete).

## Lembrete atrasado ou não enviado (critério dos Termos 6.6 e do Reembolso 3.3)

Os Termos prometem o lembrete com, no mínimo, 24 h de antecedência; sem ele por falha nossa,
o estorno integral é a pedido, pelo Suporte. Para conferir uma assinatura:

```sql
select id, status, trial_ends_at, trial_reminder_sent_at, first_payment_confirmed,
       trial_ends_at - trial_reminder_sent_at as antecedencia
  from public.subscriptions
 where id = '<id da assinatura>';
```

- `trial_reminder_sent_at` nulo com `trial_ends_at` já passado: o lembrete **não foi enviado**
  (ou falhou em todas as horas). Cabe o estorno a pedido.
- `antecedencia` menor que `interval '24 hours'`: enviado tarde demais. Cabe o estorno a pedido.
- `antecedencia` entre 24 h e 48 h: dentro do prometido.

`trial_reminder_sent_at` marca o **claim** do envio, não a entrega: se a mesma hora registrou
`trial-reminders: send failed` sem `released`, a linha está marcada sem e-mail. Em caso de
dúvida, trate como não enviado. Para ver se o cron rodou e se a function respondeu:
`cron.job_run_details` e `net._http_response` (runbook do lembrete, seção 4).

O estorno em si é feito pelo painel do Mercado Pago (o webhook absorve o estorno externo e
cancela a assinatura localmente); não há botão de admin para isso.
