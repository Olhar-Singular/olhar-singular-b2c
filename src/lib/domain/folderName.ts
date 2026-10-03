/**
 * Folder-name collisions, decided the way the database decides them.
 *
 * The unique index is `(user_id, lower(btrim(name)))`
 * (supabase/migrations/20260819010000_adaptation_folders.sql), so "Turma A",
 * "turma a" and "  TURMA A " are the same folder. Checking the list already on
 * screen with the same rule lets the UI refuse a repeated name before any
 * request; `isDuplicateFolderError` covers the race the list cannot see.
 */

const normalize = (name: string) => name.trim().toLowerCase();

export function findFolderByName<T extends { name: string }>(folders: T[], name: string): T | undefined {
  const wanted = normalize(name);
  return folders.find((f) => normalize(f.name) === wanted);
}

/** Affirmative: the app knows the cause, so it says it instead of asking. */
export function duplicateFolderMessage(name: string): string {
  return `Já existe a pasta “${name.trim()}”.`;
}

/** Postgres unique_violation, raised by the folder-name index. */
export function isDuplicateFolderError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}
