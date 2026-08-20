import { supabase } from "@/integrations/supabase/client";

import type { Attachment } from "./chat/types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_TYPES =
  "image/*,application/pdf,text/*,.md,.csv,.json,.ts,.tsx,.js,.py,.java,.c,.cpp,.go,.rs,.sql,.yaml,.yml,.html,.css,video/*,audio/*";

function kindOf(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "document";
}

export async function uploadAttachment(
  file: File,
  userId: string,
  conversationId: string | null,
): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than 25 MB.`);
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const mime = file.type || "application/octet-stream";

  const { error } = await supabase.storage.from("user-files").upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${file.name}.`);

  await supabase.from("files").insert({
    user_id: userId,
    conversation_id: conversationId,
    storage_path: path,
    file_name: file.name,
    mime_type: mime,
    size_bytes: file.size,
    kind: kindOf(mime),
  });

  return { path, name: file.name, mime, size: file.size };
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("user-files").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}