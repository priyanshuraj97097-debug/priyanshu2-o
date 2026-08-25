import { supabase } from "@/integrations/supabase/client";

import { EMPTY_STATE, type Attachment, type ChatMessage, type ConversationState, type ToolEvent } from "./types";

type Listener = () => void;

/**
 * Conversation runtime that lives outside React so a generation keeps running
 * when the user opens another chat, navigates, or opens settings.
 */
class ChatStore {
  private states = new Map<string, ConversationState>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private controllers = new Map<string, AbortController>();
  /** Conversations the user explicitly stopped — never auto-retried. */
  private stopped = new Set<string>();
  private loading = new Set<string>();

  getState(conversationId: string): ConversationState {
    return this.states.get(conversationId) ?? EMPTY_STATE;
  }

  subscribe(conversationId: string, listener: Listener): () => void {
    let set = this.listeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.listeners.set(conversationId, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  /** Notified whenever any conversation changes (used to refresh the sidebar). */
  subscribeGlobal(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  isBusy(conversationId: string): boolean {
    return this.getState(conversationId).status === "streaming";
  }

  private set(conversationId: string, patch: Partial<ConversationState>) {
    const next = { ...this.getState(conversationId), ...patch };
    this.states.set(conversationId, next);
    this.listeners.get(conversationId)?.forEach((listener) => listener());
    this.globalListeners.forEach((listener) => listener());
  }

  private updateMessage(conversationId: string, messageId: string, patch: Partial<ChatMessage>) {
    const state = this.getState(conversationId);
    this.set(conversationId, {
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message,
      ),
    });
  }

  async load(conversationId: string, force = false) {
    if (this.loading.has(conversationId)) return;
    const state = this.getState(conversationId);
    if (state.loaded && !force) return;
    if (state.status === "streaming") return;

    this.loading.add(conversationId);
    this.set(conversationId, { status: state.messages.length ? state.status : "loading" });
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, attachments, tool_calls, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    this.loading.delete(conversationId);

    if (error) {
      this.set(conversationId, { status: "idle", error: "Could not load this conversation." });
      return;
    }

    const messages: ChatMessage[] = (data ?? [])
      .filter((row) => row.role !== "system")
      .map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content ?? "",
        attachments: Array.isArray(row.attachments) ? (row.attachments as unknown as Attachment[]) : [],
        events: Array.isArray(row.tool_calls) ? (row.tool_calls as unknown as ToolEvent[]) : [],
        createdAt: row.created_at,
      }));

    this.set(conversationId, { messages, loaded: true, status: "idle", error: null });
  }

  async send(conversationId: string, input: { text: string; attachments?: Attachment[] }) {
    const attachments = input.attachments ?? [];
    const text = input.text.trim();
    if (!text && !attachments.length) return;
    if (this.isBusy(conversationId)) return;

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `local-user-${crypto.randomUUID()}`,
      role: "user",
      content: text,
      attachments,
      events: [],
      createdAt: now,
    };
    const assistantMessage: ChatMessage = {
      id: `local-assistant-${crypto.randomUUID()}`,
      role: "assistant",
      content: "",
      attachments: [],
      events: [],
      createdAt: now,
      streaming: true,
    };

    const state = this.getState(conversationId);
    this.set(conversationId, {
      messages: [...state.messages, userMessage, assistantMessage],
      status: "streaming",
      loaded: true,
      error: null,
      activeTool: null,
    });

    this.stopped.delete(conversationId);

    /**
     * One network attempt. Returns "retry" when the turn failed before a
     * single byte of the answer arrived — that case is safe to re-run.
     */
    const attempt = async (): Promise<"done" | "retry"> => {
      const controller = new AbortController();
      this.controllers.set(conversationId, controller);

      // The server heartbeats every 10s; a longer silence means the
      // connection died without closing (mobile sleep, proxy drop).
      let stalled = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const armStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stalled = true;
          controller.abort();
        }, 45_000);
      };

      let content = "";
      const events: ToolEvent[] = [];
      let received = false;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        armStallTimer();
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ conversationId, text, attachments }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          if (response.status >= 500 || response.status === 429) return "retry";
          const message =
            response.status === 401
              ? "Your session expired. Please sign in again."
              : "The assistant could not be reached. Tap retry to try again.";
          this.updateMessage(conversationId, assistantMessage.id, { error: message, streaming: false });
          this.set(conversationId, { status: "idle" });
          return "done";
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          armStallTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }
            switch (event["type"]) {
              case "user-message": {
                const id = event["id"];
                if (typeof id === "string") this.updateMessage(conversationId, userMessage.id, { id });
                break;
              }
              case "delta": {
                received = true;
                content += String(event["text"] ?? "");
                this.updateMessage(conversationId, assistantMessage.id, { content });
                break;
              }
              case "tool-start": {
                received = true;
                this.set(conversationId, { activeTool: String(event["name"] ?? "") });
                break;
              }
              case "tool-event": {
                received = true;
                events.push(event["event"] as ToolEvent);
                this.updateMessage(conversationId, assistantMessage.id, { events: [...events] });
                this.set(conversationId, { activeTool: null });
                break;
              }
              case "error": {
                received = true;
                this.updateMessage(conversationId, assistantMessage.id, {
                  error: String(event["message"] ?? "Something went wrong."),
                });
                break;
              }
              case "done": {
                const id = event["id"];
                this.updateMessage(conversationId, assistantMessage.id, {
                  ...(typeof id === "string" ? { id } : {}),
                  streaming: false,
                });
                break;
              }
              default:
                break;
            }
          }
        }

        this.updateMessage(conversationId, assistantMessage.id, { streaming: false });
        this.set(conversationId, { status: "idle", activeTool: null });
        return "done";
      } catch (error) {
        const userStopped = this.stopped.has(conversationId);
        const aborted = error instanceof DOMException && error.name === "AbortError";

        if (!userStopped && (stalled || !aborted) && !received) return "retry";

        this.updateMessage(conversationId, assistantMessage.id, {
          streaming: false,
          // Partial text stays on screen and in the thread; only a genuine
          // failure with nothing to show gets an error banner.
          ...(userStopped || received ? {} : { error: "Connection lost. Tap retry to continue." }),
        });
        this.set(conversationId, {
          status: "idle",
          activeTool: null,
          // Re-sync from the server so a partially saved turn is reconciled.
          loaded: received ? false : true,
        });
        return "done";
      } finally {
        if (stallTimer) clearTimeout(stallTimer);
        this.controllers.delete(conversationId);
      }
    };

    for (let tryIndex = 0; tryIndex < 3; tryIndex += 1) {
      const outcome = await attempt();
      if (outcome === "done" || this.stopped.has(conversationId)) {
        this.stopped.delete(conversationId);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** tryIndex));
    }

    this.updateMessage(conversationId, assistantMessage.id, {
      streaming: false,
      error: "The assistant could not be reached. Tap retry to try again.",
    });
    this.set(conversationId, { status: "idle", activeTool: null });
  }

  stop(conversationId: string) {
    this.stopped.add(conversationId);
    this.controllers.get(conversationId)?.abort();
  }

  /** Deletes the given message and everything after it, then resends `text`. */
  async resendFrom(conversationId: string, messageId: string, text: string, attachments: Attachment[]) {
    if (this.isBusy(conversationId)) return;
    const state = this.getState(conversationId);
    const index = state.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const target = state.messages[index]!;
    const removable = state.messages.slice(index).filter((m) => !m.id.startsWith("local-"));

    this.set(conversationId, { messages: state.messages.slice(0, index) });
    if (removable.length) {
      await supabase
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId)
        .gte("created_at", target.createdAt);
    }
    await this.send(conversationId, { text, attachments });
  }

  async retryLast(conversationId: string) {
    const state = this.getState(conversationId);
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const message = state.messages[i]!;
      if (message.role === "user") {
        await this.resendFrom(conversationId, message.id, message.content, message.attachments);
        return;
      }
    }
  }

  forget(conversationId: string) {
    this.stopped.add(conversationId);
    this.controllers.get(conversationId)?.abort();
    this.controllers.delete(conversationId);
    this.stopped.delete(conversationId);
    this.states.delete(conversationId);
    this.globalListeners.forEach((listener) => listener());
  }

  activeConversationIds(): string[] {
    return [...this.states.entries()]
      .filter(([, state]) => state.status === "streaming")
      .map(([id]) => id);
  }
}

export const chatStore = new ChatStore();