/**
 * Central provider configuration for Priyanshu 2.o.
 *
 * Everything about which upstream model powers which capability lives here so
 * new providers (OpenAI-compatible, image, speech, search) can be swapped in
 * without touching feature code. Credentials are read from server env only.
 */

export type ChatTier = "fast" | "balanced" | "quality";

export const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";

export const CHAT_MODELS: Record<ChatTier, string> = {
  fast: "google/gemini-3.1-flash-lite",
  balanced: "google/gemini-3.7-flash",
  quality: "google/gemini-3.1-pro-preview",
};

export const REASONING_MODEL = "google/gemini-3.1-pro-preview";
export const TITLE_MODEL = "google/gemini-3.1-flash-lite";
export const IMAGE_MODEL = "google/gemini-3.1-flash-image";
export const TTS_MODEL = "openai/gpt-4o-mini-tts";
export const STT_MODEL = "openai/gpt-4o-mini-transcribe";

export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
] as const;

export function resolveChatModel(tier: string | null | undefined): string {
  if (tier && tier in CHAT_MODELS) return CHAT_MODELS[tier as ChatTier];
  return CHAT_MODELS.balanced;
}

export function getGatewayKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI provider is not configured");
  return key;
}

/** Optional web-search provider. Absent key => search tool reports unavailable. */
export function getSearchProvider(): { name: "tavily"; key: string } | null {
  const key = process.env["TAVILY_API_KEY"];
  if (key) return { name: "tavily", key };
  return null;
}

export function gatewayHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Lovable-API-Key": getGatewayKey(),
    "X-Lovable-AIG-SDK": "fetch",
    ...extra,
  };
}

export function friendlyGatewayError(status: number): string {
  if (status === 429) return "The assistant is receiving a lot of requests right now. Please try again in a moment.";
  if (status === 402) return "AI credits for this workspace have run out. Add credits to continue.";
  if (status === 403) return "AI access is currently blocked for this workspace.";
  if (status === 400) return "That request could not be processed. Try rephrasing or removing an attachment.";
  if (status >= 500) return "The AI service is temporarily unavailable. Please retry.";
  return "Something went wrong while contacting the AI service.";
}