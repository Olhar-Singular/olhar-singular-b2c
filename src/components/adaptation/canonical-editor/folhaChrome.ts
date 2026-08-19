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
