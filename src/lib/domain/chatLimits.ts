/**
 * Size limit of one message typed into the chat (ISA).
 *
 * The `chat` edge function refuses a longer turn with a 400, so the input caps
 * the text at the same length instead of letting the teacher write something
 * the server will not take. Measured after trimming, in UTF-16 code units (the
 * unit of both `String.length` and the textarea's `maxLength`).
 *
 * The constant is DUPLICATED in the edge function (which runs under Deno and
 * avoids bundling `src/`), in `supabase/functions/_shared/chatTurn.ts`. A sync
 * test over there imports both and asserts they are equal, so they cannot drift.
 */
export const MAX_CHAT_MESSAGE_CHARS = 4000;
