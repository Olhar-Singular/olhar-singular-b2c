// =============================================================================
// The rules of one chat turn, kept pure so they are unit-testable (the chat
// function's index.ts is only HTTP/Supabase glue around them).
//
// The client still sends its whole transcript in `messages`, but none of it is
// trusted: only the LAST element is read, as the new user turn. The exchange
// count, the history the AI sees and what gets persisted all come from the row
// the server itself wrote (chat_sessions.messages). Counting the client's copy
// let anyone replay a short fake history forever on one paid session, with
// prompts of any size and forged assistant/system turns.
//
// NO URL imports in this file.
// =============================================================================

/** Max length of one user message, after trimming. Mirrors src/lib/domain/chatLimits.ts (sync test). */
export const MAX_CHAT_MESSAGE_CHARS = 4000;
/** Completed exchanges (assistant replies) one paid session allows. */
export const MAX_EXCHANGES_PER_SESSION = 20;
/** How many turns, the new one included, go to the AI. */
export const AI_CONTEXT_WINDOW = 10;
/**
 * Cap of any stored turn on its way back into the prompt. Generous for a real
 * reply (the call is limited to 2000 output tokens); it only bites on rows
 * written before the server stopped persisting whatever the client sent.
 */
export const MAX_HISTORY_ENTRY_CHARS = 12_000;
/**
 * A stored transcript ending in an unanswered user turn means a request of
 * this session is talking to the AI. Within this window a new turn is refused;
 * past it, the request is presumed dead and its turn is dropped. Twice the 60s
 * AI timeout, so a live request is never taken for a dead one.
 */
export const TURN_IN_FLIGHT_TTL_MS = 120_000;
export const SESSION_TITLE_CHARS = 60;

export const TURN_IN_FLIGHT_MESSAGE = "Aguarde a resposta da mensagem anterior antes de enviar outra.";
const LIMIT_REACHED_MESSAGE = "Limite de mensagens atingido. Inicie uma nova conversa.";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ParseTurnResult = { ok: true; turn: ChatMessage } | { ok: false; error: string };

/** Read the new user turn: the last element of the request's `messages`, and nothing else. */
export function parseUserTurn(messages: unknown): ParseTurnResult {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Campo 'messages' obrigatório e não pode estar vazio." };
  }
  const last = messages[messages.length - 1] as { role?: unknown; content?: unknown } | null;
  if (!last || typeof last !== "object" || last.role !== "user" || typeof last.content !== "string") {
    return { ok: false, error: "A última mensagem precisa ser um texto enviado por você." };
  }
  const content = last.content.trim();
  if (!content) return { ok: false, error: "A mensagem não pode ficar vazia." };
  if (content.length > MAX_CHAT_MESSAGE_CHARS) {
    return { ok: false, error: `A mensagem pode ter no máximo ${MAX_CHAT_MESSAGE_CHARS} caracteres.` };
  }
  return { ok: true, turn: { role: "user", content } };
}

/**
 * The stored transcript as turns the AI may see: well-formed user/assistant
 * entries only, extra fields stripped, each capped. Rows written before this
 * module existed may hold forged roles or oversized content.
 */
export function normalizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const history: ChatMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      history.push({ role, content: content.slice(0, MAX_HISTORY_ENTRY_CHARS) });
    }
  }
  return history;
}

/** Completed exchanges: one assistant reply each. */
export function countExchanges(history: ChatMessage[]): number {
  return history.filter((m) => m.role === "assistant").length;
}

export type TurnAdmission =
  | { ok: true; history: ChatMessage[] }
  | { ok: false; status: 409 | 429; error: string };

/**
 * Decide, from what the server stored, whether a new turn may start on an
 * existing session, and hand back the history to build on.
 */
export function admitTurn(
  stored: { messages: unknown; updatedAt: string | null },
  now: number,
): TurnAdmission {
  let history = normalizeHistory(stored.messages);
  if (history.length > 0 && history[history.length - 1].role === "user") {
    const age = now - Date.parse(stored.updatedAt ?? "");
    if (age < TURN_IN_FLIGHT_TTL_MS) return { ok: false, status: 409, error: TURN_IN_FLIGHT_MESSAGE };
    // Abandoned (or unreadable timestamp): its request died before answering.
    history = history.slice(0, -1);
  }
  if (countExchanges(history) >= MAX_EXCHANGES_PER_SESSION) {
    return { ok: false, status: 429, error: LIMIT_REACHED_MESSAGE };
  }
  return { ok: true, history };
}

/** The turns sent to the AI (after the system prompt): stored history + the new turn, windowed. */
export function buildAiContext(history: ChatMessage[], turn: ChatMessage): ChatMessage[] {
  return [...history, turn].slice(-AI_CONTEXT_WINDOW);
}

/** Title of a new session: the opening of its first turn. */
export function sessionTitle(turn: ChatMessage): string {
  return turn.content.slice(0, SESSION_TITLE_CHARS);
}
