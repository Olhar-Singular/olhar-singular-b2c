/**
 * Named folders for the adaptation library.
 *
 * A table rather than a text column on the adaptation: the name is the
 * teacher's own ("6º ano B", "Recuperação 2º bimestre"), so renaming has to be
 * one UPDATE instead of N, a typo must not silently fork a second folder, and
 * an empty folder has to exist before it holds anything.
 *
 * `subject` (matéria) stays where it is — folders answer "where did I file it",
 * matéria and `activity_type` answer "what is it". Different questions.
 */

import { supabase } from "@/integrations/supabase/client";

export type AdaptationFolder = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

const table = () => supabase.from("adaptation_folders");

/** The user's folders, alphabetical — the order they are shown in. */
export async function listFolders(): Promise<AdaptationFolder[]> {
  const { data, error } = await table()
    .select("id,user_id,name,created_at,updated_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AdaptationFolder[];
}

export async function createFolder(userId: string, name: string): Promise<AdaptationFolder> {
  const { data, error } = await table()
    .insert({ user_id: userId, name: name.trim() })
    .select("id,user_id,name,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as unknown as AdaptationFolder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await table().update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

/**
 * Delete a folder. The adaptations inside are NOT deleted — the FK is
 * ON DELETE SET NULL, so they fall back to "sem pasta". They are paid work;
 * losing them to a folder cleanup would be indefensible.
 */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}

/** File an adaptation into a folder, or take it out of every folder (null). */
export async function moveAdaptationToFolder(
  adaptationId: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("adaptations")
    .update({ folder_id: folderId })
    .eq("id", adaptationId);
  if (error) throw error;
}
