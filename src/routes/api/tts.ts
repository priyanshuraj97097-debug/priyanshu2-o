import { createFileRoute } from "@tanstack/react-router";

import { GATEWAY_BASE_URL, TTS_MODEL, TTS_VOICES, friendlyGatewayError, gatewayHeaders } from "@/lib/ai/config.server";
import { authenticateRequest, unauthorized } from "@/lib/supabase-user.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateRequest(request);
        if (!ctx) return unauthorized();

        const body = (await request.json()) as { text?: string; voice?: string; speed?: number };
        const text = (body.text ?? "").slice(0, 4000).trim();
        if (!text) return new Response(JSON.stringify({ error: "Nothing to read." }), { status: 400 });

        const voice = TTS_VOICES.includes((body.voice ?? "") as (typeof TTS_VOICES)[number])
          ? body.voice
          : "alloy";

        const response = await fetch(`${GATEWAY_BASE_URL}/audio/speech`, {
          method: "POST",
          headers: gatewayHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            model: TTS_MODEL,
            input: text,
            voice,
            instructions:
              /[\u0900-\u097F]/.test(text) || voice === "coral"
                ? "Speak in natural, fluent Hindi with correct Devanagari pronunciation and a warm conversational tone."
                : "Speak in clear, natural English with a warm conversational tone.",
            speed: Math.min(2, Math.max(0.5, body.speed ?? 1)),
          }),
        });

        if (!response.ok || !response.body) {
          return new Response(JSON.stringify({ error: friendlyGatewayError(response.status) }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(response.body, {
          headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
        });
      },
    },
  },
});