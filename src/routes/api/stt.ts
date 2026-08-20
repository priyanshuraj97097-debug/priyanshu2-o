import { createFileRoute } from "@tanstack/react-router";

import { GATEWAY_BASE_URL, STT_MODEL, friendlyGatewayError, gatewayHeaders } from "@/lib/ai/config.server";
import { authenticateRequest, unauthorized } from "@/lib/supabase-user.server";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateRequest(request);
        if (!ctx) return unauthorized();

        const incoming = await request.formData();
        const audio = incoming.get("audio");
        if (!(audio instanceof File) || audio.size === 0) {
          return new Response(JSON.stringify({ error: "No audio captured." }), { status: 400 });
        }
        if (audio.size > 20 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Recording is too long." }), { status: 400 });
        }

        const language = incoming.get("language");
        const form = new FormData();
        form.append("file", audio, audio.name || "speech.webm");
        form.append("model", STT_MODEL);
        if (typeof language === "string" && language) form.append("language", language.split("-")[0]!);

        const response = await fetch(`${GATEWAY_BASE_URL}/audio/transcriptions`, {
          method: "POST",
          headers: gatewayHeaders(),
          body: form,
        });

        if (!response.ok) {
          return new Response(JSON.stringify({ error: friendlyGatewayError(response.status) }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }

        const data = (await response.json()) as { text?: string };
        return new Response(JSON.stringify({ text: data.text ?? "" }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});