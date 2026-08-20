import { tool } from "ai";
import { create, all } from "mathjs";
import { z } from "zod";

import type { UserContext } from "@/lib/supabase-user.server";

import { GATEWAY_BASE_URL, IMAGE_MODEL, gatewayHeaders, getSearchProvider } from "./config.server";

const math = create(all!, { number: "number" });

export type ToolEvent =
  | { kind: "image"; url: string; prompt: string }
  | { kind: "sources"; sources: { title: string; url: string }[] };

type ToolContext = UserContext & {
  conversationId: string;
  emit: (event: ToolEvent) => void;
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function buildTools(ctx: ToolContext) {
  return {
    calculate: tool({
      description:
        "Evaluate a mathematical expression exactly with a computer algebra engine. Use for ANY arithmetic, algebra, calculus, matrices, statistics, unit or complex-number computation instead of doing it mentally. Supports expressions like `derivative(\"x^2\", \"x\")`, `simplify(...)`, `det([[1,2],[3,4]])`, `sqrt(2)`, `12345*6789`.",
      inputSchema: z.object({
        expression: z.string().describe("A mathjs-compatible expression."),
      }),
      execute: async ({ expression }) => {
        try {
          const result = math.evaluate(expression);
          return { expression, result: math.format(result, { precision: 14 }) };
        } catch (error) {
          return {
            expression,
            error: error instanceof Error ? error.message : "Could not evaluate that expression.",
          };
        }
      },
    }),

    generate_image: tool({
      description:
        "Generate an original image from a text prompt. Use whenever the user asks to draw, create, design, illustrate, or generate a picture, logo, poster or artwork.",
      inputSchema: z.object({
        prompt: z.string().describe("Detailed visual description of the image to create."),
      }),
      execute: async ({ prompt }) => {
        try {
          const response = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: gatewayHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              model: IMAGE_MODEL,
              messages: [{ role: "user", content: prompt }],
              modalities: ["image", "text"],
            }),
          });
          if (!response.ok) {
            return { ok: false, error: "Image generation failed. Ask the user to try again." };
          }
          const payload = (await response.json()) as {
            choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
          };
          const dataUrl = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (!dataUrl?.startsWith("data:")) {
            return { ok: false, error: "The image provider returned no image." };
          }
          const [meta, base64] = dataUrl.split(",");
          const mime = meta?.slice(5).split(";")[0] ?? "image/png";
          const ext = mime.split("/")[1] ?? "png";
          const path = `${ctx.userId}/generated/${crypto.randomUUID()}.${ext}`;
          const { error } = await ctx.supabase.storage
            .from("user-files")
            .upload(path, base64ToBytes(base64 ?? ""), { contentType: mime, upsert: false });
          if (error) return { ok: false, error: "Could not save the generated image." };

          const { data: signed } = await ctx.supabase.storage
            .from("user-files")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          await ctx.supabase.from("files").insert({
            user_id: ctx.userId,
            conversation_id: ctx.conversationId,
            storage_path: path,
            file_name: `${prompt.slice(0, 40)}.${ext}`,
            mime_type: mime,
            size_bytes: Math.round(((base64?.length ?? 0) * 3) / 4),
            kind: "generated-image",
          });
          if (signed?.signedUrl) ctx.emit({ kind: "image", url: signed.signedUrl, prompt });
          return {
            ok: true,
            note: "Image generated and already shown to the user. Do not describe it in detail; add one short caption line instead.",
          };
        } catch {
          return { ok: false, error: "Image generation is temporarily unavailable." };
        }
      },
    }),

    web_search: tool({
      description:
        "Search the live web for current facts, news, prices or anything after your knowledge cutoff. Returns sources that must be cited.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const provider = getSearchProvider();
        if (!provider) {
          return {
            available: false,
            message:
              "Web search is not connected on this deployment. Answer from your own knowledge and clearly say the information is not from a live web search.",
          };
        }
        try {
          const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: provider.key,
              query,
              max_results: 6,
              include_answer: true,
            }),
          });
          if (!response.ok) return { available: false, message: "Web search failed." };
          const data = (await response.json()) as {
            answer?: string;
            results?: { title: string; url: string; content: string }[];
          };
          const results = (data.results ?? []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.slice(0, 600),
          }));
          ctx.emit({ kind: "sources", sources: results.map((r) => ({ title: r.title, url: r.url })) });
          return { available: true, answer: data.answer, results };
        } catch {
          return { available: false, message: "Web search failed." };
        }
      },
    }),

    remember: tool({
      description:
        "Save a durable fact or preference about the user (name, role, tone preference, recurring context). Only call when the user shares something clearly worth remembering long-term.",
      inputSchema: z.object({ fact: z.string().max(300) }),
      execute: async ({ fact }) => {
        const { error } = await ctx.supabase
          .from("memories")
          .insert({ user_id: ctx.userId, content: fact, source: "assistant" });
        return error ? { saved: false } : { saved: true };
      },
    }),
  };
}