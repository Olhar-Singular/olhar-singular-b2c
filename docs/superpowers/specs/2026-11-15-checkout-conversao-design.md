# Checkout: redesign para conversão (briefing EMX, nov/2026)

**Origem:** briefing "Briefing de alterações do checkout" da EMX Digital (14/11/2026) e três
mockups (Tela 1 desktop cartão com teste, Tela 2 desktop Pix à vista, Tela 3 mobile cartão).
Arquivos fora do repo, em `~/Downloads/checkout-olharsingular/`.

**Problema:** muita gente chega ao `/assinar` pela campanha e não conclui. Causas apontadas:
textos que assustam na hora de pagar, planos descritos em "créditos" e nenhuma forma de pagar
sem cartão.

## 1. Decisões do dono (15/11/2026)

| # | Decisão |
| --- | --- |
| D1 | Onde o briefing diz Stripe, é **Mercado Pago** (provedor único desde 12/09/2026). |
| D2 | No teste grátis a pessoa **escolhe o plano** (hoje o servidor força o mais barato). Básico pré-selecionado; `?plano=` continua valendo. |
| D3 | Sai do checkout a frase "Uma cobrança de validação pode aparecer e é estornada." Ela continua na FAQ e na Política de Reembolso 3.1. |
| D4 | Depoimento no checkout **sem foto e sem avatar**: as pessoas não autorizaram foto. Reaproveita os depoimentos reais da landing. |
| D5 | O selo "Popular" do plano destacado fica como está (não vira "Mais escolhido"). |
| D6 | Pix à vista existe, pelo Mercado Pago: 1, 3 e 12 meses. |
| D7 | Créditos do Pix à vista entram **todos de uma vez** e valem até o fim do período pago (balde do plano, não extras), para não ficar mais barato que a assinatura e que os pacotes extras. |
| D8 | Preços Pix, desconto progressivo: 1 mês R$ 39,90 (300 créditos); 3 meses R$ 89,90 (900 créditos, economia de 24%, R$ 29,97/mês); 12 meses R$ 329,90 (3.600 créditos, economia de 31%, R$ 27,50/mês). Selo de economia arredonda o percentual para baixo e o valor mensal para cima no centavo, para nunca exagerar a vantagem. |
| D9 | Sem selo "Nota fiscal enviada por e-mail": não emitimos nota. |

## 2. Correções sobre os mockups (fatos do produto)

- O teste dá **50 créditos**, não "todos os créditos do plano".
- O lembrete sai 48 h antes da cobrança: é o **6º dia**, não o 5º. A cobrança é no 8º dia.
- Garantia real (Política de Reembolso, cláusula 2): estorno integral da última cobrança em
  autoatendimento na área Créditos, enquanto a assinatura estiver ativa ou até 30 dias após
  cancelar. Não é "devolvemos os créditos não usados".
- "A partir de R$ X por adaptação" arredonda **para cima** no centavo (R$ 0,67 / 0,63 / 0,56),
  para nunca anunciar menos que o preço real (o mockup arredonda para baixo).
- Com o desconto progressivo de D8, a frase "Quanto mais meses, menor o valor mensal" da Tela 2
  é verdadeira e pode ficar.

## 3. Parte 1: checkout do cartão (este ciclo)

Plano: `docs/superpowers/plans/2026-11-15-checkout-conversao-parte1.md`.

- Topo limpo no checkout anônimo: logo sem link e "Pagamento seguro · Mercado Pago"; sem "Entrar".
  Rodapé legal fica. Logado continua no `Layout` do app.
- Duas colunas no desktop (formulário à esquerda, confiança à direita); uma coluna no mobile.
- Linha do tempo do teste (Hoje, 6º dia, 8º dia) com datas calculadas, nunca fixas.
- Cards de plano em "atividades adaptadas por mês" (custo 5/8/12 créditos, já no código).
- Coluna de confiança: Resumo, O que você recebe, Depoimento (sem foto), Garantia, Selos.
- Botão próprio no lugar do botão do Brick ("Começar meus 7 dias grátis →" no teste), com
  microcopy; no mobile vira barra fixa no rodapé com "Você paga hoje". Viável porque o Card
  Payment Brick aceita `customization.visual.hidePaymentButton` + `cardPaymentBrickController.getFormData()`.
- Fonte dos campos do Brick em 16px via `customization.visual.style.customVariables` (verificar
  no navegador; os campos de número/validade/código são iframes do MP).
- Depois de definir a senha no primeiro acesso, ir para `/adaptar` (hoje `/dashboard`).
- Landing: textos do teste deixam de dizer que vira sempre o plano mais barato.

### Textos finais (Parte 1)

| Onde | Texto |
| --- | --- |
| Título (teste) | Comece hoje. Você só paga daqui a 7 dias. |
| Subtítulo (teste) | Hoje você não paga nada. Avisamos por e-mail antes da primeira cobrança, e cancelar leva 2 cliques. |
| Título (pago) | Escolha seu plano |
| Subtítulo (pago) | Créditos novos todo mês, cobrados no cartão em 1x. Cancele quando quiser. (atual) |
| Linha do tempo | HOJE · R$ 0,00 · Acesso liberado na hora, com 50 créditos para testar. / {dd/mm} · 6º DIA · Aviso por e-mail · Lembramos você 2 dias antes. Sem cobrança surpresa. / {dd/mm} · 8º DIA · {preço}/mês · Só se você continuar. Cancele antes e não paga nada. |
| Seção de planos | 1. Escolha seu plano |
| Card | {Nome} · {preço}/mês · {min} a {max} atividades adaptadas por mês · {créditos} créditos · a partir de {R$} por adaptação |
| Aviso (teste) | Hoje: R$ 0,00. Em {dd/mm/aaaa} começa o plano {Nome}, {preço}/mês. Cancele em 2 cliques antes dessa data e não é cobrado nada. |
| Botão (teste) | Começar meus 7 dias grátis → |
| Abaixo do botão (teste) | Hoje você não paga nada. Cancele em 2 cliques, sem fidelidade e sem multa. |
| Botão (pago) | Assinar por {preço}/mês → |
| Abaixo do botão (pago) | A primeira cobrança é feita agora e as próximas todo mês na mesma data. Os créditos do plano zeram a cada renovação; os extras não expiram. (atual) |
| Resumo | Plano {Nome} · mensal / {preço}/mês / Você paga hoje {R$ 0,00 ou preço} / teste: Primeira cobrança em {dd/mm/aaaa}, com aviso por e-mail 2 dias antes. / pago: Renova todo mês na mesma data. |
| O que você recebe | Provas e atividades adaptadas em minutos · Justificativa pedagógica pronta para a coordenação · Perfis de barreira salvos por aluno · Chat com a ISA e histórico completo |
| Garantia (teste) | Sem risco. Cancele antes do 8º dia e nada é cobrado. Depois, a última cobrança pode ser estornada integralmente na área Créditos, enquanto a assinatura estiver ativa ou até 30 dias após cancelar. |
| Garantia (pago) | Sem risco. A última cobrança pode ser estornada integralmente na área Créditos, enquanto a assinatura estiver ativa ou até 30 dias após cancelar. |
| Selos | Pagamento processado pelo Mercado Pago · Dados tratados conforme a LGPD · Não realiza diagnóstico. A decisão é sempre do professor. |
| Barra mobile | Você paga hoje {valor} + botão + "Cancele em 2 cliques. Sem fidelidade." (teste) |

Somem: "Teste grátis por 7 dias", "Cartão obrigatório, nada é cobrado hoje…", "Cancele antes em
Créditos", a frase da cobrança de validação, o rodapé "Você recebe 50 créditos agora…".

## 4. Parte 2: Pix à vista (próximo ciclo, spec própria)

Reaproveita a infraestrutura de Pix existente (`create-pix-payment`, QR inline, aprovação só pelo
`mp-webhook` e RPC atômica). Em aberto para a spec da Parte 2:

- Funil anônimo: quando a conta nasce (na aprovação pelo webhook é o mais seguro: gerar QR não
  pode criar conta para e-mail alheio) e como o link de acesso chega.
- Concessão no balde do plano por N meses (D7) e convivência com assinatura no cartão
  (assinar substitui o balde: avisar antes), recompra antes do fim, lembrete de fim de período.
- Garantia Pix: 7 dias com devolução integral (CDC art. 49). Termos e Reembolso ganham cláusula
  do plano à vista; `TERMS_VERSION` sobe.
- Tela 2: seletor Cartão | Pix, cards 1/3/12 meses, QR + copia e cola, aviso "o teste de 7 dias
  não se aplica".
- Risco de abuso: com 3.600 créditos liberados de uma vez e devolução integral em 7 dias, alguém
  pode consumir muito e pedir o reembolso. Definir na spec da Parte 2 (ex.: liberar o crédito do
  1º mês na hora e o resto após os 7 dias, ou devolução proporcional ao consumo, se o jurídico
  aceitar).

## 5. Fora de escopo

Pix Automático (assinatura mensal por Pix), mudança do selo "Popular", fotos de depoimento,
campos do cartão fora do Brick do MP (labels, autocomplete e teclado numérico são do MP).
