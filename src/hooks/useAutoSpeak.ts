import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/lib/chat/types";
import { speechText, synthesize } from "@/lib/voice";

/**
 * Speaks assistant replies out loud *while they stream in*.
 * Text is split into sentence-sized chunks; each finished chunk is synthesized
 * immediately and played in order, so speech starts within a second of the
 * first sentence instead of waiting for the whole answer.
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
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seededRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const activeIdRef = useRef<string | null>(null);
  const spokenLenRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const cancelRef = useRef(0);

  const stop = useCallback(() => {
    cancelRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  // Never auto-speak history that was already on screen when the chat opened.
  useEffect(() => {
    if (seededRef.current || !messages.length) return;
    for (const message of messages) seenRef.current.add(message.id);
    seededRef.current = true;
  }, [messages]);

  const play = useCallback(
    (text: string, token: number) => {
      queueRef.current = queueRef.current
        .then(async () => {
          if (cancelRef.current !== token) return;
          const blob = await synthesize(text, voice, speechRate);
          if (cancelRef.current !== token) return;
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          setSpeaking(true);
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            void audio.play().catch(() => resolve());
          });
          if (audioRef.current === audio) {
            audioRef.current = null;
            setSpeaking(false);
          }
        })
        .catch(() => {
          /* voice unavailable; the written answer still shows */
        });
    },
    [speechRate, voice],
  );

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.error) return;

    // New reply started — reset the chunker and interrupt older audio.
    if (activeIdRef.current !== last.id) {
      if (seenRef.current.has(last.id)) return;
      seenRef.current.add(last.id);
      activeIdRef.current = last.id;
      spokenLenRef.current = 0;
      stop();
    }

    const full = last.content ?? "";
    const pending = full.slice(spokenLenRef.current);
    if (!pending) return;

    // While streaming, only speak up to the last completed sentence.
    let take = pending.length;
    if (streaming) {
      const match = pending.match(/^[\s\S]*[.!?।\n]/);
      take = match ? match[0].length : 0;
      if (take < 24) return; // wait for a meaningful phrase
    }

    const chunk = pending.slice(0, take);
    spokenLenRef.current += take;
    const text = speechText(chunk);
    if (text) play(text, cancelRef.current);
  }, [enabled, streaming, messages, play, stop]);

  useEffect(() => () => audioRef.current?.pause(), []);

  return { speaking, stop };
}
