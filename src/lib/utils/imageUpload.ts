/**
 * uploadImageDataUrl — shared upload-to-Storage step for any client-cropped
 * image (auto-crop during exam extraction, or a manual re-crop from
 * ImageNodeView's "Recortar do original"). One bucket, one path convention,
 * one place that decides what a failed upload means for the caller.
 */

import { supabase } from "@/integrations/supabase/client";
import { dataUrlToBlob } from "./extraction-utils";

/** Uploads a data: URL (PNG) to the question-images bucket. Returns the public URL, or null on failure. */
export async function uploadImageDataUrl(dataUrl: string, userId: string): Promise<string | null> {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
  const { error: uploadError } = await supabase.storage
    .from("question-images")
    .upload(path, blob, { contentType: "image/png" });
  if (uploadError) {
    console.error("Image upload error:", uploadError);
    return null;
  }
  const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(path);
  return publicUrl;
}
