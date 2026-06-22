# Iteração de UX — editor de conteúdo, passo Estilo, layout e PDF (Adaptar)

> Documento vivo de requisitos/design desta iteração. Aprovação do usuário pendente antes de implementar.
> Contexto: continuação da reestruturação canônica do Adaptar (branch `feat/adaptar-canonical-restructure`). Validar no browser (skill `validate-adaptar`) ao final. TDD + gate 100%.

## Motivação (feedback do usuário, 2026-06-05)
- O fluxo de **editar questões** está confuso → simplificar.
- **Formatação (negrito/itálico/cor) deve sair da edição de conteúdo e ir pro passo Estilo.**
- A **visualização** está confusa/amontoada (instrução com muita coisa junta) → algo visual mais bonito e minimalista.
- O **destaque** do bloco selecionado está ruim.
- A **pré-visualização do Estilo deve ocupar mais tela**, e **sem dropdown** de seleção — **clicar no bloco** já abre pra editar.
- A **área do Adaptar deve ocupar mais espaço** (hoje fica apertada no meio).
- **Texto das alternativas deve quebrar linha** no editor, não rolar para o lado.
- **Bug:** o **PDF está quebrando formatação / texto sobrepondo**.

## Princípios
- **Conteúdo = substância** (o que a questão diz). **Estilo = aparência** (como fica).
- Ambos os passos editam o MESMO documento canônico (fonte única; autosave persiste). A diferença é só quais controles aparecem.
- Sempre **minimalista**.

---

## 1. Layout mais largo (wizard + passos)
A área do wizard hoje é estreita/centralizada (container `max-w-*` no meio). Alargar para usar mais a tela (ex.: `max-w-6xl`/`max-w-7xl` ou full-width com padding lateral), aplicado ao container do `CanonicalAdaptationWizard` e aos passos Conteúdo e Estilo. O editor e o preview ganham largura.

## 2. Passo Conteúdo — edição simples
- **Remover a formatação** da edição: tirar a `CanonicalToolbar` de marcas (negrito/itálico/sublinhado/tachado/cor) do editor principal **e** a toolbar de formatação do `RichTextField` (das alternativas/itens). Sobra: digitar texto, **inserir math inline** (math é conteúdo, fica), e estrutura (adicionar/deletar/reordenar questões, adicionar imagem).
- **Alternativas quebram linha**: trocar os `<input>`/campos de uma linha por um campo que **wrap** (textarea auto-resize ou contenteditable multilinha) — sem scroll horizontal.
- **Cards/instrução mais limpos** (ver §4 Visual).

## 3. Passo Estilo — clicar e editar, preview grande, popover
Transformar o `StylingSurface` de "dropdown + preview read-only + painel" em um **editor de estilo** sobre o documento, ocupando a maior parte da tela:
- **Preview grande/editável**: renderiza o documento canônico via Tiptap (editável só para formatação/seleção, não para mudar texto/estrutura — ou um editor com as ações de conteúdo desabilitadas). **Sem dropdown de bloco.**
- **Clicar num bloco** → seleciona (destaque claro, ver §5) → abre um **popover ao lado do bloco** com os controles de estilo do BLOCO: fonte, tamanho, alinhamento, espaçamento, cor, e atalhos de negrito/itálico/cor "no bloco todo".
- **Selecionar um trecho de texto** → **BubbleMenu** (mini toolbar flutuante sobre a seleção) com negrito/itálico/sublinhado/tachado/cor → aplica **marcas inline** só naquele trecho.
- **Documento inteiro**: um controle "Documento" (botão/popover no topo) que aplica estilo de bloco (fonte/tamanho/cor) a TODOS os blocos de uma vez.
- **Três níveis de formatação**, todos minimalistas: documento → bloco → seleção.

### Mapeamento no modelo canônico
- **Seleção (trecho)** → marcas inline em `RichText` (bold/italic/underline/strike/color nos runs selecionados).
- **Bloco** → `NodeStyle` do bloco (fontFamily/fontSize/align/spacing/color) + atalho "negrito/cor no bloco" = aplicar a marca inline a todos os runs do bloco.
- **Documento** → aplicar o `NodeStyle` a todos os blocos.

## 4. Visual mais bonito / minimalista
- **Card de questão**: cabeçalho enxuto (número discreto + ações), sem caixa tracejada no enunciado, seção "Resposta" com divisor sutil e respiro. Ações (↑↓🖼️🗑️) discretas (ex.: aparecem no hover ou agrupadas).
- **Instrução / título de topo**: container leve com rótulo discreto (ícone + label pequeno), bom espaçamento — não amontoado. Repensar o "Título/Instrução" atual (item C) que ficou pesado.
- Paleta/espaçamentos consistentes com shadcn/Tailwind do projeto.

## 5. Destaque do bloco selecionado (melhor)
O `ring-2 ring-primary` atual ficou ruim. Substituir por um destaque mais claro/elegante (ex.: borda/realce lateral + leve sombra/fundo, ou outline suave), consistente entre Conteúdo e Estilo. No Estilo, a seleção via clique deve ser óbvia mas minimalista.

## 6. PDF — corrigir formatação quebrada / texto sobrepondo (BUG)
Investigar `src/components/adaptation/render/pdf/` (`AdaptationPdf`, `PdfQuestion`, `PdfAnswer`, `PdfBlock`, `PdfRichText`, `nodeStyleToPdf`). Sintoma: texto passando por cima (overlap). Causas prováveis a checar: alturas fixas, `position:absolute`, falta de `flex`/`wrap` em react-pdf, math rasterizado/placeholder sobrepondo, spacing/line-height. Área **frágil** — usar o agente `pdf-debugger`. Garantir que a formatação (marcas inline, estilo de bloco, fonte) renderize sem sobreposição e quebre linha corretamente.

---

## Ordem sugerida
1. **PDF bug** (urgente, isolado, área frágil).
2. **Layout mais largo** (rápido, base visual).
3. **Conteúdo simples** (remover formatação do conteúdo + alternativas com wrap).
4. **Estilo rework** (preview grande, clique-pra-editar, popover, bubble menu, 3 níveis) — o maior.
5. **Visual/minimalista** (cards/instrução/destaque) — polish transversal, validar no browser.

Tudo com TDD + gate 100%; validação real no browser (a UI esconde bugs que o mock de Tiptap não pega — já aconteceu 2× nesta linha).

## Decisões em aberto (confirmar)
- Estilo: o preview é um Tiptap editável (para suportar seleção de texto) com as ações de CONTEÚDO desabilitadas? (recomendado — é o que permite selecionar trecho + aplicar marca).
- "Negrito no bloco todo" = aplicar marca inline a todos os runs (recomendado) vs um atributo de bloco novo.
- Largura alvo do Adaptar (`max-w-6xl` vs `max-w-7xl` vs full-width com padding).
