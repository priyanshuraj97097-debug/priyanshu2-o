import { Mic, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRecorder } from "@/hooks/useRecorder";
import { chatStore } from "@/lib/chat/store";
import { cn } from "@/lib/utils";
import { speechText, synthesize, transcribe } from "@/lib/voice";

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Starting…",
  listening: "Listening",
  transcribing: "Understanding you",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function LiveVoiceOverlay({
  conversationId,
  voice,
  speechRate,
  language,
  onClose,
}: {
  conversationId: string;
  voice: string;
  speechRate: number;
  language: string;
  onClose: () => void;
}) {
  const recorder = useRecorder();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(true);
  const mutedRef = useRef(false);
  const loopRef = useRef<(() => Promise<void>) | null>(null);

  mutedRef.current = muted;

  const stopEverything = useCallback(() => {
    activeRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    recorder.cancel();
  }, [recorder]);

  const runTurn = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      setPhase("listening");
      setTranscript("");
      setReply("");
      const blob = await recorder.start({ silenceMs: 1300, maxMs: 30_000 });
      if (!activeRef.current) return;
      if (!blob) {
        void loopRef.current?.();
        return;
      }

      setPhase("transcribing");
      const text = await transcribe(blob, language !== "auto" ? language : undefined);
      if (!activeRef.current) return;
      if (!text) {
        void loopRef.current?.();
        return;
      }
      setTranscript(text);

      setPhase("thinking");
      await chatStore.send(conversationId, { text });
      if (!activeRef.current) return;

      const messages = chatStore.getState(conversationId).messages;
      const last = messages[messages.length - 1];
      const answer = last?.role === "assistant" ? last.content : "";
      if (last?.error) {
        toast.error(last.error);
        onClose();
        return;
      }
      setReply(answer);

      const spoken = speechText(answer);
      if (spoken && !mutedRef.current) {
        setPhase("speaking");
        const audioBlob = await synthesize(spoken, voice, speechRate);
        if (!activeRef.current) return;
        const audio = new Audio(URL.createObjectURL(audioBlob));
        audioRef.current = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
        });
        audioRef.current = null;
      }

      if (!activeRef.current) return;
      void loopRef.current?.();
    } catch (error) {
      if (!activeRef.current) return;
      toast.error(error instanceof Error ? error.message : "Live conversation stopped.");
      onClose();
    }
  }, [conversationId, language, onClose, recorder, speechRate, voice]);

  loopRef.current = runTurn;

  useEffect(() => {
    activeRef.current = true;
    void runTurn();
    return () => stopEverything();
    // Runs the loop once for the lifetime of the overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = 1 + Math.min(recorder.level * 3, 0.6);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/95 px-6 backdrop-blur-xl">
      <div className="relative flex size-40 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
        <span
          className="absolute inset-4 rounded-full bg-gradient-to-br from-aurora-1 via-aurora-3 to-aurora-4 opacity-70 transition-transform duration-100"
          style={{ transform: `scale(${phase === "listening" ? scale : 1})` }}
        />
        <Mic className="relative size-10 text-background" />
      </div>

      <div className="max-w-xl space-y-3 text-center">
        <p className={cn("text-sm uppercase tracking-[0.3em] text-muted-foreground")}>
          {PHASE_LABEL[phase]}
        </p>
        {transcript ? <p className="text-lg">{transcript}</p> : null}
        {reply ? (
          <p className="max-h-40 overflow-y-auto text-sm text-muted-foreground">{reply}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            setMuted((current) => {
              const next = !current;
              if (next) audioRef.current?.pause();
              return next;
            });
          }}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          {muted ? "Voice off" : "Voice on"}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          onClick={() => {
            stopEverything();
            onClose();
          }}
        >
          <PhoneOff className="size-5" /> End
        </Button>
      </div>
    </div>
  );
}
