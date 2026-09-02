import { createFileRoute } from "@tanstack/react-router";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { z } from "zod";

import { classifyTask, detectLanguage } from "@/lib/ai/classify.server";
import { getSearchProvider } from "@/lib/ai/config.server";
import { buildSystemPrompt } from "@/lib/ai/prompt.server";
import type { ProviderAdapter } from "@/lib/ai/providers/types";
import {
  checkUserRateLimit,
  classifyFailure,
  estimateCost,
  loadSettings,
  markProviderFailure,
  markProviderSuccess,
  planRoute,
  recordUsage,
} from "@/lib/ai/router.server";
import { generateTitle } from "@/lib/ai/title.server";
import { buildTools, type ToolEvent } from "@/lib/ai/tools.server";
import { authenticateRequest, unauthorized, type UserContext } from "@/lib/supabase-user.server";

const AttachmentSchema = z.object({
  path: z.string().min(1).max(512),
  name: z.string().min(1).max(256),
  mime: z.string().min(1).max(128),
  size: z.number().int().nonnegative().optional(),
});

const ChatBodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().max(60_000).optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

type Attachment = z.infer<typeof AttachmentSchema>;

type StoredRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: unknown;
};

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|typescript|x-yaml|sql|csv))/;
const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const IMAGE_REQUEST_RE =
  /\b(generate|create|make|draw|design|render|paint|illustrate|show me)\b[^.]{0,60}\b(image|picture|photo|logo|poster|illustration|art|artwork|wallpaper|drawing|banner|icon)\b|\b(image|picture|photo|logo|poster|illustration|drawing|banner)\b[^.]{0,40}\b(banao|bana do|banaiye|dikhao)\b|चित्र|तस्वीर/i;

function encodeEvent(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

/** Providers that cannot read files get a text placeholder instead of failing outright. */
function stripAttachments(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || typeof message.content === "string") return message;
    const text = (message.content as Array<{ type: string; text?: string; filename?: string }>)
      .map((part) => (part.type === "text" ? part.text ?? "" : `[Attached file: ${part.filename ?? "file"}]`))
      .join("\n");
    return { role: "user", content: text };
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateRequest(request);
        if (!ctx) return unauthorized();

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid request." }, 400);
        }
        const parsed = ChatBodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid request." }, 400);

        const { conversationId } = parsed.data;
        const attachments = parsed.data.attachments ?? [];
        const text = (parsed.data.text ?? "").trim();
        if (!text && !attachments.length) return json({ error: "Nothing to send." }, 400);

        const settings = await loadSettings();
        const limited = await checkUserRateLimit(ctx.userId, settings);
        if (limited) return json({ error: limited }, 429);

        const [conversationRes, prefsRes, profileRes, historyRes, insertedRes] = await Promise.all([
          ctx.supabase.from("conversations").select("id, title").eq("id", conversationId).maybeSingle(),
          ctx.supabase
            .from("user_preferences")
            .select("language, memory_enabled, model_preference, custom_instructions")
            .eq("user_id", ctx.userId)
            .maybeSingle(),
          ctx.supabase.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle(),
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
          .filter((row) => row.id !== inserted?.id);

        const isFirstTurn = history.length === 0;
        const modelMessages = await buildHistory(ctx, history);
        modelMessages.push(
          ...(await buildHistory(ctx, [
            { id: "new", role: "user", content: text, attachments },
          ] as StoredRow[])),
        );

        // ---- routing decision ----
        const historyHasAttachments = history.some(
          (row) => Array.isArray(row.attachments) && (row.attachments as unknown[]).length > 0,
        );
        const task = classifyTask({
          text,
          attachmentMimes: attachments.map((a) => a.mime),
          wantsReasoning: prefs?.model_preference === "quality",
        });
        const detectedLanguage = detectLanguage(text);
        const needsTools = task === "math" || IMAGE_REQUEST_RE.test(text);
        const needsAttachments = attachments.length > 0;

        const plan = await planRoute({ task, needsTools, needsAttachments });
        if (!plan.candidates.length) {
          return json({ error: plan.unavailableReason ?? "AI is temporarily unavailable." }, 503);
        }

        const titlePromise = isFirstTurn
          ? generateTitle(text || attachments[0]?.name || "New chat")
          : Promise.resolve(null);

        const toolEvents: ToolEvent[] = [];
        const system = buildSystemPrompt({
          memories,
          customInstructions: prefs?.custom_instructions ?? null,
          language: prefs?.language ?? null,
          detectedLanguage,
          searchAvailable: Boolean(getSearchProvider()),
          displayName: profile?.display_name ?? null,
        });

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let closed = false;
            const send = (event: Record<string, unknown>) => {
              if (closed) return;
              try {
                controller.enqueue(encodeEvent(event));
              } catch {
                closed = true;
              }
            };

            send({ type: "user-message", id: inserted?.id ?? null });
            const heartbeat = setInterval(() => send({ type: "ping" }), 10_000);

            let fullText = "";
            let persisted = false;
            let servedBy: { provider: string; model: string } | null = null;

            const persist = async (): Promise<string | null> => {
              if (persisted) return null;
              persisted = true;
              if (!fullText.trim() && !toolEvents.length) return null;
              const { data: saved } = await ctx.supabase
                .from("messages")
                .insert({
                  conversation_id: conversationId,
                  user_id: ctx.userId,
                  role: "assistant",
                  content: fullText,
                  model: servedBy ? `${servedBy.provider}:${servedBy.model}` : null,
                  tool_calls: toolEvents as never,
                })
                .select("id")
                .single();
              await ctx.supabase
                .from("conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conversationId);
              return saved?.id ?? null;
            };

            const tools = buildTools({
              ...ctx,
              conversationId,
              emit: (event) => {
                toolEvents.push(event);
                send({ type: "tool-event", event });
              },
            });

            /**
             * Streams one provider attempt. Returns "ok" when the response
             * completed, "failed-before-output" when it is safe to fall back,
             * or "failed-after-output" when partial text was already sent.
             */
            const attempt = async (
              adapter: ProviderAdapter,
              fallbackUsed: boolean,
            ): Promise<"ok" | "failed-before-output" | "failed-after-output" | "aborted"> => {
              const model = adapter.modelFor(task);
              const startedAt = Date.now();
              let producedOutput = false;
              const messages =
                adapter.supportsAttachments || !(needsAttachments || historyHasAttachments)
                  ? modelMessages
                  : stripAttachments(modelMessages);

              const fail = (error: unknown) => {
                const failure = classifyFailure(error);
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[chat] ${adapter.id}/${model} failed (${failure.kind} ${failure.status}):`, message);
                if (failure.kind !== "bad-request") {
                  markProviderFailure(adapter.id, failure.kind, failure.retryAfterMs, message.slice(0, 200));
                }
                recordUsage({
                  userId: ctx.userId,
                  conversationId,
                  provider: adapter.id,
                  model,
                  taskType: task,
                  inputTokens: 0,
                  outputTokens: 0,
                  latencyMs: Date.now() - startedAt,
                  status: failure.kind === "rateLimited" || failure.kind === "quota" ? "rate_limited" : "error",
                  errorCode: failure.status ? String(failure.status) : failure.kind,
                  estimatedCost: 0,
                  fallbackUsed,
                });
              };

              try {
                const result = streamText({
                  model: adapter.languageModel(task),
                  system,
                  messages,
                  ...(adapter.supportsTools ? { tools, stopWhen: stepCountIs(12) } : {}),
                  // One quick in-provider retry for blips; the router handles
                  // anything longer by moving to the next provider.
                  maxRetries: 1,
                  abortSignal: request.signal,
                });

                for await (const part of result.fullStream) {
                  if (part.type === "text-delta") {
                    if (!part.text) continue;
                    producedOutput = true;
                    fullText += part.text;
                    send({ type: "delta", text: part.text });
                  } else if (part.type === "tool-call") {
                    producedOutput = true;
                    send({ type: "tool-start", name: part.toolName });
                  } else if (part.type === "error") {
                    throw part.error;
                  }
                }

                const usage = await Promise.resolve(result.usage).catch(() => undefined);
                const inputTokens = usage?.inputTokens ?? 0;
                const outputTokens = usage?.outputTokens ?? 0;
                const hasImage = toolEvents.some((e) => e.kind === "image");
                if (!fullText.trim() && !hasImage) {
                  throw Object.assign(new Error("Empty response from provider"), { statusCode: 502 });
                }

                servedBy = { provider: adapter.id, model };
                markProviderSuccess(adapter.id);
                recordUsage({
                  userId: ctx.userId,
                  conversationId,
                  provider: adapter.id,
                  model,
                  taskType: task,
                  inputTokens,
                  outputTokens,
                  latencyMs: Date.now() - startedAt,
                  status: "success",
                  estimatedCost: estimateCost(adapter, inputTokens, outputTokens),
                  fallbackUsed,
                });
                return "ok";
              } catch (error) {
                const aborted =
                  request.signal.aborted ||
                  (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
                if (aborted) {
                  recordUsage({
                    userId: ctx.userId,
                    conversationId,
                    provider: adapter.id,
                    model,
                    taskType: task,
                    inputTokens: 0,
                    outputTokens: 0,
                    latencyMs: Date.now() - startedAt,
                    status: "aborted",
                    estimatedCost: 0,
                    fallbackUsed,
                  });
                  servedBy = { provider: adapter.id, model };
                  return "aborted";
                }
                fail(error);
                if (producedOutput) {
                  servedBy = { provider: adapter.id, model };
                  return "failed-after-output";
                }
                return "failed-before-output";
              }
            };

            try {
              let outcome: Awaited<ReturnType<typeof attempt>> = "failed-before-output";
              for (let index = 0; index < plan.candidates.length; index += 1) {
                const adapter = plan.candidates[index]!;
                outcome = await attempt(adapter, index > 0);
                if (outcome !== "failed-before-output") break;
                if (request.signal.aborted) {
                  outcome = "aborted";
                  break;
                }
              }

              const savedId = await persist();

              if (outcome === "failed-before-output") {
                send({
                  type: "error",
                  message: "Priyanshu 2.o is at full capacity right now. Please try again in a few minutes.",
                });
              } else if (outcome === "failed-after-output") {
                send({ type: "error", message: "The response was cut short. You can retry to continue." });
              }

              const title = outcome === "ok" ? await titlePromise : null;
              if (title) {
                await ctx.supabase.from("conversations").update({ title }).eq("id", conversationId);
              }
              send({ type: "done", id: savedId, title });
            } catch (error) {
              console.error("[chat] fatal", error);
              const savedId = await persist().catch(() => null);
              send({ type: "error", message: "The assistant is unavailable right now. Please retry." });
              send({ type: "done", id: savedId, title: null });
            } finally {
              clearInterval(heartbeat);
              closed = true;
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
