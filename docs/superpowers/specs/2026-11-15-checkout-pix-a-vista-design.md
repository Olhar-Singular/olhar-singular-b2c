# Checkout Parte 2: plano à vista no Pix

**Origem:** briefing da EMX (14/11/2026), mockup "Tela 2 desktop Pix à vista" e a spec da Parte 1
(`docs/superpowers/specs/2026-11-15-checkout-conversao-design.md`, seção 4 e decisões D6 a D9).
O dono pediu para fazer "tudo, até o final" sem novas perguntas: as decisões abertas viraram as
regras R1 a R11 abaixo, cada uma com o custo se estiver errada.

**Problema:** parte grande do público (professor de rede pública) não tem cartão disponível ou não
quer cadastrar cartão numa plataforma nova. Hoje o `/assinar` só aceita cartão.

## 1. O que o dono já decidiu (Parte 1)

- D6: Pix à vista pelo Mercado Pago, 1, 3 e 12 meses.
- D7: créditos no balde do plano (não extras), valendo até o fim do período pago.
- D8: 1 mês R$ 39,90 (300 créditos); 3 meses R$ 89,90 (900, economia de 24%, R$ 29,97/mês);
  12 meses R$ 329,90 (3.600, economia de 31%, R$ 27,50/mês). Percentual arredonda para baixo,
  valor mensal para cima no centavo.
- D9: sem selo de nota fiscal.
- D5: o destaque continua "Popular" (o mockup diz "Mais escolhido").

## 2. Regras desta spec (decididas sem o dono, revisáveis)

| # | Regra | Por quê | Custo se estiver errada |
| --- | --- | --- | --- |
| R1 | **Liberação em duas partes.** Na confirmação do Pix entra a cota de 1 mês (créditos ÷ meses: 300). O restante (600 no trimestral, 3.300 no anual) entra no **8º dia** depois da confirmação, se o pagamento não tiver sido estornado. O plano de 1 mês libera tudo na hora. | Garantia de 7 dias com devolução **integral** (CDC art. 49, mockup) sem deixar 3.600 créditos de IA expostos a "usa tudo e pede reembolso". A exposição fica igual à da assinatura no cartão (1 mês de créditos). | Se o dono quiser tudo de uma vez (D7 literal), basta zerar `PREPAID_UNLOCK_DAYS` e o texto. |
| R2 | **Garantia:** 7 dias corridos da confirmação, devolução integral, pedida pelo suporte (como no mockup). Sem autoatendimento nesta entrega. | O mockup diz "é só pedir pelo suporte"; o estorno sai pelo painel do MP. | Se pedirem autoatendimento, é uma entrega à parte (o webhook já trata o estorno). |
| R3 | **Estorno chega pelo webhook.** Pagamento do plano com status `refunded` ou `charged_back` → compra `refunded`, a parte travada é cancelada e os créditos liberados por ela saem do balde (até o saldo existente); o fim do período recua os meses dela, nunca para antes de agora. | Sem isso, quem é estornado pelo painel ficaria com o plano e ainda receberia a parte travada no 8º dia. | Créditos removidos a mais ou a menos num caso raro; suporte ajusta com `admin_grant_credits`. |
| R4 | **Conta nasce na aprovação** (funil anônimo). Gerar QR não cria conta. Na confirmação o webhook acha a conta pelo e-mail ou cria uma (senha aleatória, `must_set_password`), grava o aceite dos Termos e manda o link de acesso pelo mesmo e-mail de login do Supabase (`signInWithOtp`). E-mail que já tem conta no momento do QR recebe 409 "Este e-mail já tem conta. Entre para pagar." | Gerar QR é grátis: criar conta ali deixaria qualquer um ocupar o e-mail de outra pessoa. | Se a conta for criada entre o QR e o pagamento (corrida rara), os créditos vão para ela, que é de quem tem o e-mail. |
| R5 | **Tela acompanha por um endpoint público** (`pix-plan-status`, só o status de uma compra de plano, pelo id). | Sem sessão, a RLS não deixa ler `credit_purchases`. O id é uuid v4 e a resposta não tem dado pessoal. | Nenhum dado sensível vaza; no pior caso alguém com o id vê "aprovado". |
| R6 | **Não convive com assinatura no cartão.** Com assinatura viva, o Pix responde 409 "Você já tem uma assinatura no cartão." Com plano à vista ativo, a assinatura no cartão responde 409 "Você tem um plano à vista ativo até {data}. Para continuar, renove no Pix ou assine no cartão depois dessa data." | A renovação do cartão substitui o balde: o cliente perderia meses pagos. | Quem quiser trocar antes do fim fala com o suporte. |
| R7 | **Recompra estende.** Comprar com plano à vista ativo soma os créditos (mesma regra R1) e empurra o fim do período em N meses a partir do fim atual. Sem plano à vista ativo (teste de convite, período vencido), substitui o balde, com o aviso que já existe (`replacementNotice`). | É o comportamento que o "renove no Pix" de R6 promete. | Nenhum dinheiro some: só a data muda. |
| R8 | **Catálogo em tabela** (`prepaid_plans`), preço e créditos lidos do banco, nunca do pedido, com uma linha admin-only de R$ 1,00 (1 mês, 1 crédito) para o smoke em produção, já que o sandbox do MP não tem Pix. | Mesmo padrão de `plans` e `credit_packages`. | Nenhum. |
| R9 | **Contas cortesia** (`exempt`) não compram, como na assinatura. O super-admin compra (smoke). | Mesmo `canSubscribe`. | Nenhum. |
| R10 | **Lembrete de fim de período fica para depois.** A área Créditos mostra o plano à vista com a data de fim, a parte que ainda vai entrar e o botão "Renovar no Pix". | Lembrete é outro cron + e-mail; não trava a venda. | Clientes podem deixar vencer sem aviso por e-mail até a próxima entrega. |
| R11 | **Termos e Reembolso ganham a cláusula do plano à vista** e `TERMS_VERSION` vai para `2026-11.1`. O texto novo **precisa passar pela advogada antes de ir para produção**. | Contrato novo (pagamento único, liberação em duas partes, garantia). | Publicar sem revisão jurídica. |

## 3. Experiência

`/assinar` (anônimo, teste ou pago, e logado) ganha o passo "Forma de pagamento" acima dos planos:
dois botões de rádio, **Cartão de crédito** e **Pix**. Trocar não recarrega a página e preserva a conta
digitada. `?pagamento=pix` abre direto no Pix. Recusa de cartão oferece "Pagar com Pix".

### Textos (Pix)

| Onde | Texto |
| --- | --- |
| Título | Pague no Pix, sem precisar de cartão. |
| Subtítulo | Acesso liberado em segundos depois do pagamento. Quanto mais meses, menor o valor mensal. |
| Opção Cartão (teste) | Cartão de crédito · Teste 7 dias grátis. Nada é cobrado hoje. |
| Opção Cartão (pago) | Cartão de crédito · Assinatura mensal. Cancele quando quiser. |
| Opção Pix | Pix · Sem cartão. Planos à vista, acesso imediato. |
| Aviso (só no funil de teste) | No Pix o pagamento é à vista, então o teste de 7 dias não se aplica. Mas você tem 7 dias de garantia: se não servir, devolvemos o valor integral. |
| Seção 1 | 1. Por quanto tempo você quer acesso? |
| Card 1 mês | 1 MÊS · R$ 39,90 · 300 créditos · 25 a 60 adaptações · Equivale a R$ 39,90 por mês |
| Card 3 meses | 3 MESES · Popular · R$ 89,90 · 900 créditos · 75 a 180 adaptações · Economia de 24% · R$ 29,97 por mês |
| Card 12 meses | 12 MESES · R$ 329,90 · 3.600 créditos · o ano letivo inteiro · Economia de 31% · R$ 27,50 por mês |
| Liberação (planos > 1 mês) | {cota mensal} créditos entram na hora; os outros {resto} entram no 8º dia, depois do prazo de garantia. |
| Seção 2 | 2. Pague com o app do seu banco |
| Botão | Gerar meu código Pix |
| Com o QR | Escaneie o QR code no app do seu banco. · Ou use o Pix copia e cola · Copiar · Assim que o pagamento cair, seu acesso é liberado automaticamente. Normalmente leva alguns segundos. |
| Confirmado (anônimo) | Pagamento confirmado! Enviamos para {e-mail} o link de acesso. Abra o e-mail para entrar e criar sua senha. |
| Confirmado (logado) | Pagamento confirmado! {n} créditos já estão na sua conta. · botão "Começar a adaptar" (`/adaptar`) |
| Expirado/recusado | O Pix expirou ou não foi concluído. Gere um novo código para tentar de novo. · botão "Gerar novo código" |
| Resumo | Acesso por {N} {mês/meses} · {créditos} créditos · Você paga hoje {preço} · Pagamento único. Nada é cobrado de novo sem você pedir. |
| Garantia | 7 dias de garantia · Se não servir para a sua realidade de sala, devolvemos o valor integral em até 7 dias. É só pedir pelo suporte. |
| Barra mobile | Você paga hoje {preço} + "Gerar meu código Pix" + "Pagamento único. Sem renovação automática." |

Área Créditos, com plano à vista ativo: card "Plano à vista" com "Válido até {dd/mm/aaaa}", "+{n}
créditos entram em {dd/mm}" enquanto houver parte travada, e o botão "Renovar no Pix"
(`/assinar?pagamento=pix`).

## 4. Dados e servidor

- `prepaid_plans` (catálogo, RLS de leitura igual a `credit_packages`).
- `credit_purchases` ganha `kind` (`extra` | `plan`), `prepaid_plan_id`, `plan_months`,
  `buyer_email`, `buyer_name`, `terms_version`, `plan_locked_credits`, `plan_unlock_at`,
  `plan_released_at`, `refunded_at`; status aceita `refunded`.
- `approve_purchase_and_grant` passa a reivindicar só `kind = 'extra'` (uma compra de plano nunca
  vira extra por engano).
- RPCs novas (só `service_role`): `user_id_by_email`, `approve_prepaid_plan`,
  `release_prepaid_credits` (pg_cron de hora em hora), `refund_prepaid_plan`,
  `prepaid_plan_active` (usada pelo `subscribe`).
- Functions novas: `pix-plan-checkout` (gera o QR; anônimo ou logado; rate limit do checkout) e
  `pix-plan-status` (status público). `mp-webhook` decide pelo `kind` da compra. Lógica em
  `_shared/`, `index.ts` só cola.
- E-mail de confirmação do plano à vista (Decreto 7.962, art. 4º): o que foi comprado, valor,
  validade, liberação em duas partes e garantia, pelo Resend.

## 5. Fora de escopo

Pix Automático, lembrete de fim de período (R10), estorno em autoatendimento do Pix (R2), troca
entre cartão e Pix antes do fim (R6), relatórios de receita.
