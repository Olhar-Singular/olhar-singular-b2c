/**
 * Credits one AI extraction of an exam file costs: the question bank's
 * "Extrair com IA" (`extract-questions`) and the Adaptar upload path
 * (`extract-exam-for-adaptation`, charged at "Gerar" on top of the adaptation).
 *
 * The edge functions carry their own copy (`EXTRACTION_COST` in
 * `supabase/functions/_shared/examExtractionCore.ts`, since Deno does not
 * bundle `src/`); a sync test over there asserts both are equal.
 */
export const EXTRACTION_COST = 5;
