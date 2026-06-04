# Melhorias no editor de questões (Adaptar) — design aprovado

> Aprovado pelo usuário 2026-06-04. Implementar todos os itens, TDD + gate 100%, validar no browser (skill `validate-adaptar`) ao final. Branch `feat/adaptar-canonical-restructure`.

## Itens

### A. Remover número / pontos / dificuldade (limpeza)
Remover `number`, `points`, `difficulty` de:
- `src/lib/adaptation/canonical/schema.ts` (Question block) e os testes.
- `src/lib/adaptation/canonical/ai.ts` (`AiQuestionSchema`) + `normalizeAiActivity` (parar de mapear) + `supabase/functions/_shared/adaptationPrompt.ts` (parar de pedir esses campos).
- `nodeviews/QuestionNodeView.tsx` (controles do cabeçalho).
- `render/blocks/QuestionView.tsx` e `render/pdf/PdfQuestion.tsx` (header).
- Testes que referenciam (`CanonicalRenderer.test.tsx` etc.).
**Número automático pela ordem:** o renderer de tela e o PDF calculam o ordinal (`1.`, `2.`…) pela posição da questão entre os blocos `question` do documento. O editor mostra "Questão N" read-only (N = ordinal computado via `getPos` + contagem de questões anteriores). Sem campo editável.

### B. Ações no card da questão (cabeçalho enxuto)
No `QuestionNodeView`, cabeçalho = `Questão N · ↑ ↓ · 🖼️ · 🗑️`:
- **Deletar**: botão 🗑️ → `deleteNode()` (Tiptap NodeViewProps).
- **Reordenar ↑/↓**: move o bloco da questão uma posição entre os blocos de topo. Lógica pura testável (`moveBlock(doc, pos, dir)`) ou via transação ProseMirror (delete+insert) usando `getPos`. Desabilitar ↑ no 1º / ↓ no último.
- **Adicionar imagem**: botão 🖼️ abre `ImageManagerModal`; ao escolher, insere um bloco `image` no `stem` da questão (reusa `ImageManagerModal`/`imageManagerUtils`).

### C. Tudo dentro de blocos (visual grouping)
Cada bloco de TOPO (heading/paragraph/question) renderiza num **container visual claro** no editor, com rótulo discreto do tipo (ex.: "Título", "Instrução"). Nada de texto solto. Questões mantêm o card. Abordagem: NodeViews leves para heading/paragraph de topo OU CSS em `.ProseMirror > *` (escolher a de menor risco; evitar card duplo na questão). Critério: nenhum texto aparece "fora" de um container.

### D. Rich-text nas alternativas/respostas (maior item)
Novo `RichTextField` — mini-Tiptap de 1 parágrafo (negrito/itálico/sublinhado/tachado/cor + math inline) que recebe/emite `RichText` (reusar o mapeamento inline `pmToInline`/`inlineToPm` do `tiptap/`). Substituir os `<Input>` de texto plano no `AnswerEditor` (alternativas, V/F, checkbox, associação, lacunas) e na legenda de imagem (`ImageNodeView`). Preserva formatação ao editar. Lógica pura testada 100%; componente mocka `@tiptap/react`.

### E. Destacar bloco selecionado na estilização
`StylingSurface` passa `selectedId` → `CanonicalRenderer` → `BlockView` → block views; o bloco selecionado ganha anel/borda (`ring-2 ring-primary`) no preview. `selectedId` opcional (default undefined = sem destaque).

### F. Imagens de questões do banco (marcador + bloco)
- `buildActivityText` (StepActivityInput): para questão com `image_url`, anexar marcador `\n[IMAGEM: <url> | <alt opcional>]`.
- `adaptationPrompt.ts`: instruir a IA que um marcador `[IMAGEM: url]` significa emitir um bloco `image` (src=url, alt) no `stem` daquela questão.
- A URL do bucket `question-images` (https) passa no `isSafeImageSrc`. Sem multimodal, sem mudar a assinatura da edge function.

## Ordem
A → B → C → E → F → D. Cada item: TDD, `npx vitest run --coverage` (gate 100%), `tsc`/`eslint` limpos, commits na branch. Validação no browser ao final com a skill `validate-adaptar` (delete/reorder/header limpo/imagem do banco/rich-text).

## Fora de escopo (roadmap)
Drag-and-drop de reordenação (botões ↑/↓ primeiro); multimodal de imagens.
