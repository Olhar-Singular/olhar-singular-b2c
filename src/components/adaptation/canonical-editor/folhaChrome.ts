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
 * O foco que revela o rail é o DELE MESMO (`focus-within`, sem `group-`), que é
 * o que o teclado precisa. `group-focus-within` seria o do bloco inteiro: os
 * campos internos da questão (instrução, alternativas, legenda) são descendentes
 * do wrapper, então editá-los deixaria a caixa opaca acesa durante toda a edição,
 * invadindo o bloco de cima e roubando o clique da última linha dele (achado
 * 0336, mesma raiz do 0420). Aceso só por hover, o excesso é um relance.
 *
 * A classe marcadora `folha-rail` não pinta nada: é o gancho que o hospedeiro
 * observa (`has-[.folha-rail:focus-within]`) para reservar o vão enquanto o rail
 * está aceso pelo teclado, estado em que não existe hover para o excesso "sumir
 * sozinho" (achado 0338).
 *
 * `-translate-y-full`: a caixa é OPACA, então ela não pode ser desenhada sobre
 * o texto do próprio bloco (achado 0205). Ela sobe para o vão acima dele — e o
 * hospedeiro tem de reservar esse vão: ver FOLHA_RAIL_HOST.
 */
export const FOLHA_RAIL =
  "folha-rail absolute right-0 top-0 z-10 -translate-y-full flex items-center gap-1 rounded-md border border-surface-line-2 " +
  "bg-surface-paper p-0.5 shadow-sm pointer-events-none opacity-0 transition-opacity " +
  "group-hover:pointer-events-auto group-hover:opacity-100 " +
  "focus-within:pointer-events-auto focus-within:opacity-100 " +
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
 *
 * Ressalva dos achados 0420 e 0336: em ponteiro fino a invasão só "some sozinha"
 * enquanto o rail depender de hover. Foco em qualquer campo dentro do bloco (o
 * `autoFocus` do LaTeX, a instrução ou uma alternativa da questão) acendia o rail
 * pelo tempo todo da edição — por isso FOLHA_RAIL reage a `focus-within` e não a
 * `group-focus-within` (0336), e o BlockMathNodeView ainda esconde o rail com o
 * editor aberto, levando a exclusão para dentro da caixa do editor (0420).
 *
 * Sobra o estado que o 0336 não cobriu: tabular ATÉ o rail acende a mesma caixa
 * opaca, e quem chega por teclado não tem hover para o excesso sumir sozinho —
 * ele fica sobre a última linha do bloco de cima pelas paradas todas do rail
 * (achado 0338). Por isso a reserva também vale enquanto o foco está DENTRO do
 * rail: `has-[.folha-rail:focus-within]:mt-10`. Continua sendo só um estado
 * transitório e provocado pelo próprio usuário de teclado — em repouso a folha
 * segue medindo `my-3`, como 0102/0113 exigem, e o hover não reserva nada, para
 * não empurrar texto sob o ponteiro (0413).
 */
export const FOLHA_RAIL_HOST =
  "group relative my-3 has-[.folha-rail:focus-within]:mt-10 [@media(hover:none)]:mt-10";
