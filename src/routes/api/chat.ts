import { createFileRoute } from "@tanstack/react-router";
import { stepCountIs, streamText, type ModelMessage } from "ai";

import { friendlyGatewayError, getSearchProvider, resolveChatModel, TITLE_MODEL, GATEWAY_BASE_URL, gatewayHeaders } from "@/lib/ai/config.server";
import { createProvider } from "@/lib/ai/gateway.server";
import { buildSystemPrompt } from "@/lib/ai/prompt.server";
import { buildTools, type ToolEvent } from "@/lib/ai/tools.server";
import { authenticateRequest, unauthorized, type UserContext } from "@/lib/supabase-user.server";

type Attachment = {
  path: string;
  name: string;
  mime: string;
  size?: number;
};

type ChatBody = {
  conversationId?: string;
  text?: string;
  attachments?: Attachment[];
};

type StoredRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: unknown;
};

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|typescript|x-yaml|sql|csv))/;
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

function encodeEvent(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

async function attachmentToParts(
  ctx: UserContext,
  attachment: Attachment,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await ctx.supabase.storage
    .from("user-files")
    .createSignedUrl(attachment.path, 60 * 30);
  const url = data?.signedUrl;
  if (!url) return [{ type: "text", text: `[Attachment ${attachment.name} could not be opened]` }];

  if (attachment.mime.startsWith("image/")) {
    return [{ type: "image", image: new URL(url), mediaType: attachment.mime }];
  }

  const response = await fetch(url);
  if (!response.ok) return [{ type: "text", text: `[Attachment ${attachment.name} unavailable]` }];
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_INLINE_BYTES) {
    return [{ type: "text", text: `[Attachment ${attachment.name} is too large to analyse]` }];
  }

  if (TEXT_MIME.test(attachment.mime)) {
    const text = new TextDecoder().decode(buffer).slice(0, 200_000);
    return [{ type: "text", text: `File: ${attachment.name}\n\n${text}` }];
  }

  return [
    {
      type: "file",
      data: new Uint8Array(buffer),
      mediaType: attachment.mime || "application/octet-stream",
      filename: attachment.name,
    },
  ];
}

async function buildHistory(ctx: UserContext, rows: StoredRow[]): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];
  for (const row of rows) {
    if (row.role === "assistant") {
      if (row.content.trim()) messages.push({ role: "assistant", content: row.content });
      continue;
    }
    const attachments = Array.isArray(row.attachments) ? (row.attachments as Attachment[]) : [];
    if (!attachments.length) {
      messages.push({ role: "user", content: row.content });
      continue;
    }
    const parts: Array<Record<string, unknown>> = [];
    for (const attachment of attachments) parts.push(...(await attachmentToParts(ctx, attachment)));
    if (row.content.trim()) parts.push({ type: "text", text: row.content });
    messages.push({ role: "user", content: parts } as unknown as ModelMessage);
  }
  return messages;
}

async function generateTitle(firstMessage: string): Promise<string | null> {
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: TITLE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Write a 2-5 word title for this conversation. Plain text only, no quotes, no punctuation at the end.",
          },
          { role: "user", content: firstMessage.slice(0, 500) },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const title = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
    return title ? title.slice(0, 80) : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateRequest(request);
        if (!ctx) return unauthorized();

        const body = (await request.json()) as ChatBody;
        const conversationId = body.conversationId;
        if (!conversationId) {
          return new Response(JSON.stringify({ error: "Missing conversation." }), { status: 400 });
        }

        const attachments = body.attachments ?? [];
        const text = (body.text ?? "").trim();
        if (!text && !attachments.length) {
          return new Response(JSON.stringify({ error: "Nothing to send." }), { status: 400 });
        }

        // All setup reads run concurrently — this is the biggest chunk of
        // pre-token latency, and none of them depend on each other.
        const [conversationRes, prefsRes, profileRes, historyRes, insertedRes] = await Promise.all([
          ctx.supabase.from("conversations").select("id, title").eq("id", conversationId).maybeSingle(),
          ctx.supabase
            .from("user_preferences")
            .select("language, memory_enabled, model_preference, custom_instructions")
            .eq("user_id", ctx.userId)
            .maybeSingle(),
          ctx.supabase.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle(),
          // Newest-first + reverse keeps the *recent* window of a long thread,
          // instead of silently freezing context at the first 60 messages.
          ctx.supabase
            .from("messages")
            .select("id, role, content, attachments, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(60),
          ctx.supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              user_id: ctx.userId,
              role: "user",
              content: text,
              attachments: attachments as never,
            })
            .select("id")
            .single(),
        ]);

        const conversation = conversationRes.data;
        if (!conversation) return unauthorized();
        const prefs = prefsRes.data;
        const profile = profileRes.data;
        const inserted = insertedRes.data;

        let memories: string[] = [];
        if (prefs?.memory_enabled !== false) {
          const { data } = await ctx.supabase
            .from("memories")
            .select("content")
            .order("created_at", { ascending: false })
            .limit(40);
          memories = (data ?? []).map((m) => m.content);
        }

        const history = ((historyRes.data ?? []) as StoredRow[])
          .slice()
          .reverse()
          // The just-inserted user turn is appended explicitly below; guard
          // against it also arriving through the history read.
          .filter((row) => row.id !== inserted?.id);

        const isFirstTurn = history.length === 0;
        const modelMessages = await buildHistory(ctx, history);
        modelMessages.push(
          ...(await buildHistory(ctx, [
            { id: "new", role: "user", content: text, attachments },
          ] as StoredRow[])),
        );

        // Kick off the title request in parallel with generation so the first
        // turn never waits for it before the `done` event.
        const titlePromise = isFirstTurn
          ? generateTitle(text || attachments[0]?.name || "New chat")
          : Promise.resolve(null);

        const toolEvents: ToolEvent[] = [];
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: Record<string, unknown>) => {
              try {
                controller.enqueue(encodeEvent(event));
              } catch {
                /* client disconnected */
              }
            };

            send({ type: "user-message", id: inserted?.id ?? null });

            let fullText = "";
            try {
              const provider = createProvider();
              const model = resolveChatModel(prefs?.model_preference);
              const result = streamText({
                model: provider(model),
                system: buildSystemPrompt({
                  memories,
                  customInstructions: prefs?.custom_instructions ?? null,
                  language: prefs?.language ?? null,
                  searchAvailable: Boolean(getSearchProvider()),
                  displayName: profile?.display_name ?? null,
                }),
                messages: modelMessages,
                tools: buildTools({
                  ...ctx,
                  conversationId,
                  emit: (event) => {
                    toolEvents.push(event);
                    send({ type: "tool-event", event });
                  },
                }),
                stopWhen: stepCountIs(12),
              });

              for await (const part of result.fullStream) {
                if (part.type === "text-delta") {
                  fullText += part.text;
                  send({ type: "delta", text: part.text });
                } else if (part.type === "tool-call") {
                  send({ type: "tool-start", name: part.toolName });
                } else if (part.type === "error") {
                  const message =
                    typeof part.error === "object" && part.error && "statusCode" in part.error
                      ? friendlyGatewayError(Number((part.error as { statusCode: number }).statusCode))
                      : "The assistant could not finish that response.";
                  send({ type: "error", message });
                }
              }

              const usage = await Promise.resolve(result.usage).catch(() => undefined);
              const hasImage = toolEvents.some((e) => e.kind === "image");
              if (!fullText.trim() && !hasImage) {
                send({ type: "error", message: "The assistant returned an empty response. Try again." });
              }

              const { data: saved } = await ctx.supabase
                .from("messages")
                .insert({
                  conversation_id: conversationId,
                  user_id: ctx.userId,
                  role: "assistant",
                  content: fullText,
                  model,
                  tool_calls: toolEvents as never,
                  token_usage: usage ? (usage as never) : null,
                })
                .select("id")
                .single();

              await ctx.supabase
                .from("conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conversationId);

              if (usage) {
                await ctx.supabase.from("usage_events").insert({
                  user_id: ctx.userId,
                  kind: "chat",
                  model,
                  input_tokens: Math.round(usage.inputTokens ?? 0),
                  output_tokens: Math.round(usage.outputTokens ?? 0),
                });
              }

              let title: string | null = null;
              if (isFirstTurn) {
                title = await generateTitle(text || attachments[0]?.name || "New chat");
                if (title) {
                  await ctx.supabase.from("conversations").update({ title }).eq("id", conversationId);
                }
              }

              send({ type: "done", id: saved?.id ?? null, title });
            } catch (error) {
              console.error("[chat]", error);
              send({ type: "error", message: "The assistant is unavailable right now. Please retry." });
            } finally {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});