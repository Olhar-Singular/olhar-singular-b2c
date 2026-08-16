---
name: caca-autonoma
description: >-
  Use ao montar ou rodar uma varredura autônoma de bugs neste projeto, com o usuário
  ausente. Triggers: "deixa a Claude caçando bugs sozinha", "roda a noite toda",
  "acha os bugs que os usuários reclamam", "loop de caça e correção", "corrige sozinho
  enquanto durmo", bug visual que o usuário relata mas não reproduz, ou qualquer pedido
  de trabalho autônomo prolongado sem supervisão. Cobre: por que bug visual não é
  achável lendo código, o protocolo de fila em arquivo, as restrições deste repo que
  impedem worktree, os limites de segurança (nunca push na main) e o modelo de custo real.
---

# Caça autônoma de bugs

## Visão geral

Duas frentes rodando sem supervisão: uma **caça** (só encontra, nunca edita) e uma
**corrige** (só conserta o que está na fila). O ponto de contato entre elas é um
**arquivo de fila fora do repositório**, nunca conversa direta. Handoff por arquivo é
auditável, sobrevive a qualquer uma das frentes morrer, e não some quando alguém troca
de branch.

**Princípio que governa o desenho:** o usuário não vai revisar. Então a segurança não
vem de revisão, vem de o trabalho nunca alcançar produção sozinho e de cada correção
ser descartável individualmente.

## Quando usar

- O usuário vai ficar ausente e liberou a máquina para trabalho prolongado.
- Existem bugs relatados por usuários que ele não consegue reproduzir.
- A área alvo tem retorno alto por varredura (Adaptar, PDF, edge functions).

**Quando NÃO usar:** tarefa com escopo fechado (é só fazer), qualquer coisa que
precise de decisão de produto no meio, ou área onde uma correção errada custa caro e
não é revertível por commit (migrations aplicadas no remoto, deploy de function).

## Bug visual não é achável lendo código

O erro mais caro deste desenho é montar um caçador que faz `grep` e `read`. Ele volta
com tipo frouxo e código morto, enquanto o que queima o usuário é layout quebrado,
elemento cortado, texto invisível, estado que não re-renderiza. **Nada disso gera log,
exceção ou teste vermelho.** Cobertura de 100% no Vitest não pega, porque o mock do
Tiptap esconde o crash de render.

O caçador tem que **abrir o app e usar**:

1. `make verify-adaptar` sobe o ambiente real em `localhost:3000` (Supabase local,
   seed, functions, dev server). Detalhe da estratégia em camadas: skill `validate-adaptar`.
2. Chrome DevTools MCP dirige o browser: navega, clica, preenche, redimensiona.
3. Varrer por **estado de dado × viewport**, não por arquivo: questão longa, com
   imagem, com math, 8 alternativas, texto sem quebra, em 1920 / 1366 / 768 / 390.
4. Procurar o que não vira log: overflow horizontal, elemento cortado, sobreposição,
   contraste, foco perdido, estado que não atualiza após ação.
5. Exportar o PDF e comparar com a tela. Paridade PDF × screen é onde mais nasce
   "quebrou e ninguém viu". Área frágil: agente `pdf-debugger`.

**Todo achado nasce com screenshot, passos exatos e viewport.** Isso não é capricho de
formato: o problema do usuário não é só achar, é conseguir reproduzir depois. Achado
sem reprodução determinística volta a ser "o usuário reclamou e eu não vejo".

## Restrições deste repo que definem o desenho

Estas quatro já foram descobertas na prática. Ignorar qualquer uma quebra o loop.

| Restrição | Consequência no desenho |
| --- | --- |
| `docker-compose.yml` monta só a raiz (`.:/app`) e `node_modules` é volume do container | **Worktree não roda `make test`.** O corretor trabalha na árvore única, numa branch. Nada de `git worktree`. |
| Worktree e branch não compartilham arquivo não-commitado | **A fila mora fora do repo** (ex.: `~/my projects/orientador-caca/`). Dentro do repo ela seria arrastada pelo lint-staged ou sumiria na troca de branch. |
| `pre-commit` (lint-staged no container) arrasta arquivo não-staged para dentro do commit | Rodar `make test` **manualmente** e commitar com `--no-verify`. Antes de começar, exigir working tree limpo: se outra sessão tem trabalho não commitado, o primeiro commit do corretor engole tudo. |
| Push na `main` dispara deploy no Vercel | **O corretor nunca dá push e nunca commita na `main`.** Branch `caca/correcoes`, um commit por achado. O usuário faz merge ou apaga a branch inteira. |

Duas redes de proteção que parecem existir e não existem: `npm run typecheck` **não
checa nada** neste repo (config com `files: []`), e o gate de 100% de cobertura só
garante que existe teste, não que o teste é bom. Na prática **o Vitest é a única rede**.

## Protocolo da fila

Um arquivo por achado, nunca um arquivo único compartilhado (dois processos escrevendo
no mesmo arquivo se sobrescrevem). O caçador só **cria**; o corretor só **edita status**.

```
orientador-caca/
├── fila/0007-alternativa-cortada-390px.md
└── RELATORIO.md          # índice legível, regerado a partir da fila
```

```markdown
---
id: 0007
status: pendente | corrigindo | corrigido | bloqueado
gravidade: quebra | correcao-incorreta | qualidade
area: adaptar | edge-fn | pdf
arquivo: src/components/adaptation/render/blocks/QuestionView.tsx:88
viewport: 390x844
screenshot: ./shots/0007.png
---
## O que está errado
## Passos exatos para reproduzir
## Comportamento esperado
## Corretor: o que foi feito   (preenchido pelo corretor, com o SHA do commit)
```

Regra de convergência: **o caçador confere a fila antes de registrar** e pula duplicata,
e mantém um `PROGRESSO.md` do que já varreu. Sem isso, cada iteração revarre a mesma
tela e a fila enche de repetido.

## Contrato do corretor

1. Puxa o `pendente` de menor id, marca `corrigindo`.
2. TDD obrigatório: teste vermelho primeiro, depois a correção (comando `/tdd`).
3. `make test` inteiro precisa passar. Falhou, ou a correção exige mudar contrato
   público / schema canônico? Marca `bloqueado` com o motivo e vai para o próximo.
   **Não improvisa em área frágil.**
4. Um commit por achado, mensagem referenciando o id (convenção: skill `commit-crafting`).
   Commit individual é o que torna qualquer correção ruim revertível sozinha.
5. Nunca `push`. Nunca `main`. Nunca `db push` nem deploy de function.

## Orquestração: serializar por recurso, paralelizar por contexto

Workflow nomeado: **`.claude/workflows/caca-autonoma.mjs`**. Rodar com
`Workflow({ name: 'caca-autonoma' })`, parametrizável por `args`
(`rondas`, `maxCorrecoes`, `analistas`, `soCacar`, `cenarios`).

**Subagentes aqui não paralelizam trabalho, isolam contexto.** Os recursos são únicos:
um browser, uma árvore de trabalho, um container. Dois agentes dirigindo o mesmo Chrome
colidem na aba; dois corrigindo na mesma branch se atropelam; dois rodando `make test`
disputam o mesmo container. O ganho é o outro, e é o que importa: contexto limpo por
unidade (o driver de 52% do custo) e esforço definido por agente.

| Fase | Serial ou paralelo | Esforço | Por quê |
| --- | --- | --- | --- |
| Preflight | serial, bloqueante | médio | Árvore suja aborta tudo antes de qualquer commit |
| Captura | **serial, 1 agente** | alto | Browser é recurso único; ele coleta evidência e não julga |
| Análise | **paralelo** | alto | Já não precisa de browser nem de árvore: aqui a paralelização é real |
| Correção | **serial** | médio | Árvore e container são únicos; um commit por achado |
| Relatório | serial | baixo | Só formata o que já existe |

A separação captura/análise não é enfeite: é o que libera a única paralelização legítima
e mantém o agente do browser com contexto curto.

## Modelo de custo

Medido neste projeto (22 sessões, 3.765 mensagens), a preço de Opus 5:

- **US$ 0,19 por mensagem** do assistente, em média.
- Composição: **leitura de cache 52%, escrita de cache 35%, saída 13%.**

A consequência é contraintuitiva e é a principal decisão de engenharia aqui:

> **Esforço quase não afeta o custo. Tamanho de contexto afeta.**

Saída (que o esforço controla) é 13% da conta. O que domina é o contexto relido a cada
turno. Prova no histórico: sessão de 363 mensagens custou US$ 0,149/msg; a de 775
mensagens custou US$ 0,316/msg. Mesmo trabalho, **custo por mensagem dobrou só porque o
contexto cresceu**.

Portanto: **cada achado e cada correção começam com contexto curto**, usando a fila como
memória entre eles. Um loop que acumula a noite toda no mesmo contexto paga 2 a 3 vezes
mais pelo mesmo resultado. Sessão contínua de trabalho ativo custa entre US$ 25 e
US$ 100/hora; uma noite de 8 horas com as duas frentes projeta US$ 400 a 800.

## Erros comuns

| Erro | Consequência |
| --- | --- |
| Caçador lendo código em vez de dirigir o browser | Traz ruído de qualidade e não acha nenhum bug visual, que é o objetivo |
| Fila dentro do repo | Some na troca de branch ou vira commit acidental |
| Worktree isolado para o corretor | `make test` não roda (mount do compose) e a rede de proteção some |
| Commit único no fim | Diff irrevisável e impossível de reverter por partes |
| Deixar o contexto crescer a noite toda | Custo por mensagem dobra ou triplica sem ganho |
| Começar com working tree sujo | O primeiro commit engole o trabalho não commitado de outra sessão |
| Achado sem screenshot e passos | O usuário continua sem conseguir reproduzir, que era o problema original |

## Estado desta skill

Escrita a partir do desenho e das restrições verificadas na máquina (mount do compose,
`node_modules` no volume, ausência de deps no host). **Ainda não foi testada com
subagentes em cenário real** conforme a skill `superpowers:writing-skills` exige.

Primeira execução deve ser supervisionada e curta:
`Workflow({ name: 'caca-autonoma', args: { rondas: 1, soCacar: true } })`. Isso exercita
preflight, captura e análise sem tocar em código. Só depois de a fila vir com achados
reproduzíveis é que faz sentido liberar a fase de correção e uma noite inteira.
