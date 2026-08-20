import { supabase } from "@/integrations/supabase/client";

export type VoiceError = { message: string };

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function transcribe(blob: Blob, language?: string): Promise<string> {
  const form = new FormData();
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  form.append("audio", new File([blob], `speech.${extension}`, { type: blob.type || "audio/webm" }));
  if (language) form.append("language", language);

  const response = await fetch("/api/stt", {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not transcribe that recording.");
  }
  const data = (await response.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export async function synthesize(text: string, voice: string, speed = 1): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, voice, speed }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Voice playback is unavailable right now.");
  }
  return response.blob();
}

/** Strips markdown noise so spoken output sounds natural. */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_>#|]/g, "")
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 3500);
}