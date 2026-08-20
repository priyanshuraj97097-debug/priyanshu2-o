import { useCallback, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording";

/** Microphone recorder with optional silence detection for live conversation. */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    recorderRef.current = null;
    setLevel(0);
    setStatus("idle");
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  /**
   * Starts recording. Resolves with the recorded audio when `stop()` is called
   * or, when `silenceMs` is set, after the speaker goes quiet.
   */
  const start = useCallback(
    async (options?: { silenceMs?: number; maxMs?: number }): Promise<Blob | null> => {
      setStatus("requesting");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        setStatus("idle");
        throw new Error("Microphone access was blocked. Allow microphone permission and try again.");
      }

      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      const promise = new Promise<Blob | null>((resolve) => {
        resolveRef.current = resolve;
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        cleanup();
        resolveRef.current?.(blob.size > 1200 ? blob : null);
        resolveRef.current = null;
      };

      recorder.start(250);
      setStatus("recording");

      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const startedAt = performance.now();
      let lastLoud = performance.now();
      let hasSpoken = false;

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const value = (buffer[i]! - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / buffer.length);
        setLevel(rms);

        const now = performance.now();
        if (rms > 0.035) {
          lastLoud = now;
          hasSpoken = true;
        }
        if (options?.silenceMs && hasSpoken && now - lastLoud > options.silenceMs) {
          stop();
          return;
        }
        if (options?.maxMs && now - startedAt > options.maxMs) {
          stop();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return promise;
    },
    [cleanup, stop],
  );

  const cancel = useCallback(() => {
    resolveRef.current?.(null);
    resolveRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
  }, [cleanup]);

  return { status, level, start, stop, cancel };
}