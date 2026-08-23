import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/lib/chat/types";
import { speechText, synthesize } from "@/lib/voice";

/**
 * Speaks each newly completed assistant reply out loud.
 * Only the latest reply is ever playing; new replies interrupt older audio.
 */
export function useAutoSpeak({
  enabled,
  streaming,
  messages,
  voice,
  speechRate,
}: {
  enabled: boolean;
  streaming: boolean;
  messages: ChatMessage[];
  voice: string;
  speechRate: number;
}) {
  const spokenRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seededRef = useRef(false);

  // Never auto-speak history that was already on screen when the chat opened.
  useEffect(() => {
    if (seededRef.current) return;
    if (!messages.length) return;
    for (const message of messages) spokenRef.current.add(message.id);
    seededRef.current = true;
  }, [messages]);

  useEffect(() => {
    if (!enabled) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    if (streaming) return;

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.error) return;
    if (spokenRef.current.has(last.id)) return;

    const text = speechText(last.content ?? "");
    spokenRef.current.add(last.id);
    if (!text) return;

    let cancelled = false;
    void (async () => {
      try {
        const blob = await synthesize(text, voice, speechRate);
        if (cancelled) return;
        audioRef.current?.pause();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.volume = 1;
        audioRef.current = audio;
        await audio.play().catch(() => {
          /* browser blocked autoplay — the Listen button still works */
        });
      } catch {
        /* voice unavailable; text answer is still shown */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, streaming, messages, voice, speechRate]);

  useEffect(() => () => audioRef.current?.pause(), []);
}
