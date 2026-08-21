import { useNavigate } from "@tanstack/react-router";
import { Menu, PanelLeft, Plus, Sparkle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BrandMark, BrandWordmark } from "@/components/Brand";
import { ConversationSidebar, useCreateConversation } from "@/components/chat/ConversationSidebar";
import { Composer } from "@/components/chat/Composer";
import { LiveVoiceOverlay } from "@/components/chat/LiveVoiceOverlay";
import { MessageItem } from "@/components/chat/MessageItem";
import { SettingsDialog } from "@/components/chat/SettingsDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { chatStore } from "@/lib/chat/store";
import type { Attachment, ChatMessage } from "@/lib/chat/types";
import { useConversation } from "@/lib/chat/useConversation";

const SUGGESTIONS = [
  "Explain quantum entanglement simply",
  "Solve 3x² − 12x + 7 = 0 step by step",
  "Refactor this Python function for speed",
  "Generate an image of a neon mountain city",
];

export function ChatScreen({ conversationId }: { conversationId: string | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const createConversation = useCreateConversation();
  const state = useConversation(conversationId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (conversationId) void chatStore.load(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages, conversationId]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const send = useCallback(
    async (input: { text: string; attachments: Attachment[] }) => {
      stickRef.current = true;
      let id = conversationId;
      if (!id) {
        try {
          id = await createConversation.mutateAsync();
        } catch {
          toast.error("Could not start a new chat.");
          return;
        }
        void navigate({ to: "/c/$conversationId", params: { conversationId: id } });
      }
      void chatStore.send(id, input);
    },
    [conversationId, createConversation, navigate],
  );

  const onEdit = (message: ChatMessage, text: string) => {
    if (!conversationId) return;
    void chatStore.resendFrom(conversationId, message.id, text, message.attachments);
  };

  const busy = state.status === "streaming";

  const startLive = async () => {
    let id = conversationId;
    if (!id) {
      try {
        id = await createConversation.mutateAsync();
      } catch {
        toast.error("Could not start a live conversation.");
        return;
      }
      await navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    }
    setLiveOpen(true);
  };

  if (!user) return null;

  return (
    <div className="app-aurora flex h-[100dvh] w-full overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        <ConversationSidebar activeId={conversationId} onOpenSettings={() => setSettingsOpen(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open chats">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              <ConversationSidebar
                activeId={conversationId}
                onOpenSettings={() => {
                  setSidebarOpen(false);
                  setSettingsOpen(true);
                }}
                onNavigate={() => setSidebarOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 md:hidden">
            <BrandMark className="size-6" />
            <BrandWordmark className="text-sm" />
          </div>

          <PanelLeft className="hidden size-4 text-muted-foreground md:block" />
          <span className="hidden text-sm text-muted-foreground md:block">
            {busy ? "Generating a response…" : "Ready"}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="New chat"
            onClick={() => void navigate({ to: "/" })}
          >
            <Plus className="size-5" />
          </Button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {state.messages.length === 0 ? (
              <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                <BrandMark className="size-16" />
                <h1 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">
                  Priyanshu <span className="aurora-text">2.o</span>
                </h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  One assistant for conversation, coding, mathematics, research, images, files, and
                  voice. Just start typing — it works out what you need.
                </p>
                <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send({ text: suggestion, attachments: [] })}
                      className="glass-panel rounded-xl px-4 py-3 text-left text-sm transition-colors hover:bg-surface-raised"
                    >
                      <Sparkle className="mb-1.5 size-3.5 text-primary" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {state.messages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    busy={busy}
                    voice={preferences.voice_name}
                    speechRate={preferences.speech_rate}
                    onEdit={onEdit}
                    onRetry={() => conversationId && void chatStore.retryLast(conversationId)}
                  />
                ))}
                {state.activeTool ? (
                  <p className="shimmer-text text-sm">
                    {state.activeTool === "generate_image"
                      ? "Creating your image…"
                      : state.activeTool === "web_search"
                        ? "Searching the web…"
                        : state.activeTool === "calculate"
                          ? "Verifying the calculation…"
                          : "Working…"}
                  </p>
                ) : null}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-border/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              userId={user.id}
              conversationId={conversationId}
              busy={busy}
              sendOnEnter={preferences.send_on_enter}
              language={preferences.language}
              onSend={(input) => void send(input)}
              onStop={() => conversationId && chatStore.stop(conversationId)}
              onLive={() => void startLive()}
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Priyanshu 2.o can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {liveOpen && conversationId ? (
        <LiveVoiceOverlay
          conversationId={conversationId}
          voice={preferences.voice_name}
          speechRate={preferences.speech_rate}
          language={preferences.language}
          onClose={() => setLiveOpen(false)}
        />
      ) : null}
    </div>
  );
}
