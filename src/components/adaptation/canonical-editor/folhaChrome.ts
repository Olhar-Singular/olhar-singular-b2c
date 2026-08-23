/**
 * Button classes for chrome that sits ON the sheet.
 *
 * The folha is ALWAYS light — it is a sheet of paper, and it does not follow
 * the app theme. shadcn's variants resolve the generic tokens (`bg-background`,
 * `border-input`, `bg-accent`), which in dark mode are dark teal, so a plain
 * `variant="outline"` paints a dark button on white paper. The surface-* family
 * is the sheet's own palette.
 *
 * This has now been rediscovered in the appearance popover, the block inserter,
 * the question card, the answer editors and the image controls — hence a
 * constant instead of a sixth hand-written copy.
 */
export const FOLHA_BUTTON =
  "border-surface-line-2 bg-surface-paper text-surface-ink hover:bg-surface-mesa hover:text-surface-ink";

/** Borderless variant, for controls that should recede until hovered. */
export const FOLHA_GHOST =
  "text-surface-ink-soft hover:bg-surface-mesa hover:text-surface-ink";

/**
 * Rail de ações de um nodeview (chrome flutuante no canto superior direito).
 *
 * NÃO usar `hidden` + `group-hover:flex`: `display:none` tira os botões da ordem
 * de tabulação, e o rail só reapareceria se algo dentro dele recebesse foco —
 * ciclo fechado que deixa as ações inalcançáveis por teclado. E `:focus-within`
 * do wrapper nunca dispara ao editar o texto, porque o `contenteditable` do
 * Tiptap é o `.ProseMirror` ancestral, não um descendente do nodeview.
 * Por isso: sempre no fluxo, escondido só por opacidade, e visível de saída em
 * ponteiro grosso, que não tem hover nenhum (achado 0232).
 *
 * `-translate-y-full`: a caixa é OPACA, então ela não pode ser desenhada sobre
 * o texto do próprio bloco (achado 0205). Ela sobe para o vão acima dele — e o
 * hospedeiro tem de reservar esse vão: ver FOLHA_RAIL_HOST.
 */
export const FOLHA_RAIL =
  "absolute right-0 top-0 z-10 -translate-y-full flex items-center gap-1 rounded-md border border-surface-line-2 " +
  "bg-surface-paper p-0.5 shadow-sm pointer-events-none opacity-0 transition-opacity " +
  "group-hover:pointer-events-auto group-hover:opacity-100 " +
  "group-focus-within:pointer-events-auto group-focus-within:opacity-100 " +
  "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

/**
 * Wrapper de um nodeview que hospeda um FOLHA_RAIL.
 *
 * O rail é ancorado ACIMA do bloco e mede ~34px; o `my-3` (12px) do wrapper não
 * cabe nele. Em ponteiro fino a invasão só existe durante o hover e some sozinha.
 * Em `(hover: none)` o rail é permanente (achado 0232), então a invasão vira o
 * estado de repouso da folha e apaga texto impresso do bloco de cima — no
 * documento semeado, a palavra "adaptada" do H1 (achado 0233).
 *
 * Por isso a reserva é aplicada só em `(hover: none)`: lá ela é estática (não
 * empurra texto sob o ponteiro, que era o defeito do achado 0413) e lá é o
 * único lugar onde o rail está sempre visível.
 */
export const FOLHA_RAIL_HOST = "group relative my-3 [@media(hover:none)]:mt-10";
