import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Code2,
  Image as ImageIcon,
  Lightbulb,
  Menu,
  PanelLeft,
  PenLine,
  Plus,
  Sigma,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
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
import { useAutoSpeak } from "@/hooks/useAutoSpeak";
import { usePreferences } from "@/hooks/usePreferences";
import { normalizeLanguage, normalizeVoice } from "@/lib/voice-options";
import { chatStore } from "@/lib/chat/store";
import type { Attachment, ChatMessage } from "@/lib/chat/types";
import { useConversation } from "@/lib/chat/useConversation";

const SUGGESTIONS = [
  { label: "Explain", icon: Lightbulb, prompt: "Explain in simple terms: " },
  { label: "Write", icon: PenLine, prompt: "Write a clear, well-structured " },
  { label: "Code", icon: Code2, prompt: "Write code that " },
  { label: "Solve Math", icon: Sigma, prompt: "Solve step by step: " },
  { label: "Analyze", icon: BarChart3, prompt: "Analyze the following and give key insights: " },
  { label: "Create Image", icon: ImageIcon, prompt: "Create an image of " },
];

export function ChatScreen({ conversationId }: { conversationId: string | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { preferences, update } = usePreferences();
  const createConversation = useCreateConversation();
  const state = useConversation(conversationId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [insert, setInsert] = useState<{ text: string; nonce: number } | null>(null);
  const insertIntoComposer = useCallback((text: string) => setInsert({ text, nonce: Date.now() }), []);
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

  /** Restores the user prompt that produced an assistant reply into the composer. */
  const onEditPrompt = (assistantMessage: ChatMessage) => {
    const index = state.messages.findIndex((m) => m.id === assistantMessage.id);
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = state.messages[i];
      if (candidate?.role === "user") {
        insertIntoComposer(candidate.content);
        return;
      }
    }
  };

  const busy = state.status === "streaming";

  const { speaking, stop: stopSpeaking } = useAutoSpeak({
    enabled: preferences.auto_speak && !liveOpen,
    streaming: busy,
    messages: state.messages,
    voice: normalizeVoice(preferences.voice_name, preferences.language),
    speechRate: preferences.speech_rate,
  });

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
          {state.messages.length > 0 ? (
            <h1 className="sr-only">
              Priyanshu 2.o — Multimodal AI assistant for coding, maths, research and voice
            </h1>
          ) : null}
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

          {speaking ? (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={stopSpeaking}
            >
              <Square className="size-3.5" /> Stop voice
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            className={speaking ? "" : "ml-auto"}
            aria-label={preferences.auto_speak ? "Turn spoken replies off" : "Turn spoken replies on"}
            title={preferences.auto_speak ? "Spoken replies on" : "Spoken replies off"}
            onClick={() => {
              if (preferences.auto_speak) stopSpeaking();
              update({ auto_speak: !preferences.auto_speak });
            }}
          >
            {preferences.auto_speak ? (
              <Volume2 className="size-5 text-primary" />
            ) : (
              <VolumeX className="size-5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
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
                <div className="mt-6 grid w-full max-w-xl grid-cols-3 gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      onClick={() => insertIntoComposer(suggestion.prompt)}
                      className="glass-panel flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium transition-colors hover:bg-surface-raised sm:text-sm"
                    >
                      <suggestion.icon className="size-4 text-primary" />
                      {suggestion.label}
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
                    voice={normalizeVoice(preferences.voice_name, preferences.language)}
                    speechRate={preferences.speech_rate}
                    onEdit={onEdit}
                    onEditPrompt={onEditPrompt}
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
              language={normalizeLanguage(preferences.language)}
              onSend={(input) => void send(input)}
              onStop={() => conversationId && chatStore.stop(conversationId)}
              onLive={() => void startLive()}
              insert={insert}
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
          voice={normalizeVoice(preferences.voice_name, preferences.language)}
          speechRate={preferences.speech_rate}
          language={normalizeLanguage(preferences.language)}
          onClose={() => setLiveOpen(false)}
        />
      ) : null}
    </div>
  );
}
