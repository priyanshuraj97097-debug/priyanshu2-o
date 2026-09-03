import { Check, Copy, Loader2, Pencil, RefreshCw, Volume2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/Brand";
import { Markdown } from "@/components/Markdown";
import { AttachmentPreview } from "@/components/chat/AttachmentChip";
import { GeneratedImage } from "@/components/chat/GeneratedImage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/chat/types";
import { speechText, synthesize } from "@/lib/voice";

type Props = {
  message: ChatMessage;
  busy: boolean;
  voice: string;
  speechRate: number;
  onEdit: (message: ChatMessage, text: string) => void;
  onEditPrompt?: (message: ChatMessage) => void;
  onRetry: () => void;
};

export function MessageItem({ message, busy, voice, speechRate, onEdit, onEditPrompt, onRetry }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const speak = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setSpeaking(false);
      return;
    }
    const text = speechText(message.content);
    if (!text) return;
    setSpeaking(true);
    try {
      const blob = await synthesize(text, voice, speechRate);
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        setSpeaking(false);
      };
      await audio.play();
    } catch (error) {
      setSpeaking(false);
      toast.error(error instanceof Error ? error.message : "Voice playback failed.");
    }
  };

  if (message.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-2">
        {message.attachments.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentPreview key={attachment.path} attachment={attachment} />
            ))}
          </div>
        ) : null}

        {editing ? (
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-24 resize-none border-0 bg-transparent focus-visible:ring-0"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(false);
                }}
              >
                <X className="size-4" /> Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft.trim() || busy}
                onClick={() => {
                  setEditing(false);
                  onEdit(message, draft.trim());
                }}
              >
                Send again
              </Button>
            </div>
          </div>
        ) : (
          <>
            {message.content ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-7 text-primary-foreground">
                {message.content}
              </div>
            ) : null}
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy message">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setEditing(true)}
                aria-label="Edit message"
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      <BrandMark className="mt-1 size-7 shrink-0" />
      <div className="min-w-0 flex-1">
        {message.content ? <Markdown content={message.content} /> : null}

        {message.events.map((event, index) =>
          event.kind === "image" ? (
            <GeneratedImage key={index} url={event.url} prompt={event.prompt} />
          ) : (
            <div key={index} className="my-3 rounded-xl border border-border bg-surface/60 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sources from the web
              </p>
              <ul className="space-y-1 text-sm">
                {event.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2"
                    >
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}

        {message.streaming && !message.content ? (
          <p className="shimmer-text text-sm">Thinking…</p>
        ) : null}

        {message.error ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <span>{message.error}</span>
            <Button size="sm" variant="secondary" onClick={onRetry} disabled={busy}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : null}

        {!message.streaming && message.content ? (
          <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy response">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={speak} aria-label="Listen to response">
              {speaking ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onRetry} disabled={busy} aria-label="Regenerate">
              <RefreshCw className="size-3.5" />
            </Button>
            {onEditPrompt ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onEditPrompt(message)}
                aria-label="Edit prompt"
                title="Edit prompt"
              >
                <Pencil className="size-3.5" />
                <span className="hidden text-xs sm:inline">Edit prompt</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}