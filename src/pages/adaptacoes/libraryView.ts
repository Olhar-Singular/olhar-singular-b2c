/**
 * Pure view logic for the adaptation library: filter, then group into folders.
 *
 * Kept out of the component so the rules are testable on their own — the page
 * only wires state to these. Grouping happens on the client because the page
 * already fetches every row the teacher owns; a `where folder_id = ?` round
 * trip per folder would buy nothing.
 */

export const UNFILED = "Sem pasta";

export type LibraryRow = {
  id: string;
  folder_id?: string | null;
  subject?: string | null;
  activity_type?: string | null;
};

export type LibraryFolder = { id: string; name: string };

export type LibraryFilters = {
  /** null = todas as matérias. */
  subject: string | null;
  /** null = todos os tipos. */
  activityType: string | null;
};

export function filterRows<T extends LibraryRow>(rows: T[], filters: LibraryFilters): T[] {
  return rows.filter((r) => {
    if (filters.subject && r.subject !== filters.subject) return false;
    if (filters.activityType && r.activity_type !== filters.activityType) return false;
    return true;
  });
}

export type LibraryGroup<T> = { id: string | null; name: string; rows: T[] };

/**
 * One group per folder, in the folders' own order, plus "Sem pasta" LAST.
 *
 * EMPTY FOLDERS ARE KEPT. That is the whole point of folders being rows rather
 * than a text column: a folder the teacher just created has to be visible
 * before anything is in it, otherwise there is nowhere to move the first
 * adaptation to. Only "Sem pasta" is hidden when empty — it is a fallback, not
 * a folder someone made.
 */
export function groupByFolder<T extends LibraryRow>(
  rows: T[],
  folders: LibraryFolder[],
): Array<LibraryGroup<T>> {
  const byFolder = new Map<string, T[]>();
  const unfiled: T[] = [];
  for (const row of rows) {
    if (!row.folder_id) {
      unfiled.push(row);
      continue;
    }
    const bucket = byFolder.get(row.folder_id);
    if (bucket) bucket.push(row);
    else byFolder.set(row.folder_id, [row]);
  }

  const named: Array<LibraryGroup<T>> = folders.map((f) => ({
    id: f.id,
    name: f.name,
    rows: byFolder.get(f.id) ?? [],
  }));

  // A row can point at a folder the list does not have (deleted in another tab).
  // Dropping it silently would make an adaptation vanish from the library, so
  // it falls back to "Sem pasta" instead.
  const knownIds = new Set(folders.map((f) => f.id));
  for (const [folderId, bucket] of byFolder) {
    if (!knownIds.has(folderId)) unfiled.push(...bucket);
  }

  return unfiled.length > 0 ? [...named, { id: null, name: UNFILED, rows: unfiled }] : named;
}
