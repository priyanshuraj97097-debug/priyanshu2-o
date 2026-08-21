import { ArrowUp, Loader2, Mic, Paperclip, Radio, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AttachmentChip } from "@/components/chat/AttachmentChip";
import { Button } from "@/components/ui/button";
import { useRecorder } from "@/hooks/useRecorder";
import type { Attachment } from "@/lib/chat/types";
import { ACCEPTED_TYPES, uploadAttachment } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { transcribe } from "@/lib/voice";

type Props = {
  userId: string;
  conversationId: string | null;
  busy: boolean;
  sendOnEnter: boolean;
  language: string;
  onSend: (input: { text: string; attachments: Attachment[] }) => void;
  onStop: () => void;
  onLive: () => void;
};

export function Composer({
  userId,
  conversationId,
  busy,
  sendOnEnter,
  language,
  onSend,
  onStop,
  onLive,
}: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorder = useRecorder();

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [text]);

  const submit = () => {
    if (busy || uploading) return;
    if (!text.trim() && !attachments.length) return;
    onSend({ text, attachments });
    setText("");
    setAttachments([]);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await uploadAttachment(file, userId, conversationId));
      }
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleMic = async () => {
    if (recorder.status === "recording") {
      recorder.stop();
      return;
    }
    try {
      const blob = await recorder.start({ maxMs: 120_000 });
      if (!blob) return;
      setTranscribing(true);
      const result = await transcribe(blob, language !== "auto" ? language : undefined);
      if (result) setText((current) => (current ? `${current} ${result}` : result));
      else toast.info("Nothing was heard. Try again.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Microphone unavailable.");
    } finally {
      setTranscribing(false);
    }
  };

  const recording = recorder.status === "recording";

  return (
    <div className="glass-panel rounded-[1.75rem] p-2 shadow-[0_20px_60px_-30px_oklch(0.7_0.17_260/0.7)]">
      {attachments.length ? (
        <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.path}
              attachment={attachment}
              onRemove={() =>
                setAttachments((current) => current.filter((item) => item.path !== attachment.path))
              }
            />
          ))}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && sendOnEnter) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={recording ? "Listening…" : "Ask anything — text, images, files, math, code"}
        aria-label="Message Priyanshu 2.o"
        className="max-h-[220px] w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
      />

      <div className="flex items-center gap-1 px-1.5 pb-1">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Attach files"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={recording ? "Stop recording" : "Record voice message"}
          disabled={transcribing}
          onClick={() => void toggleMic()}
          className={cn(recording && "text-destructive")}
        >
          {transcribing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : recording ? (
            <Square className="size-4 fill-current" />
          ) : (
            <Mic className="size-4" />
          )}
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Live conversation" onClick={onLive}>
          <Radio className="size-4" />
        </Button>

        <span className="ml-1 hidden text-[11px] text-muted-foreground sm:inline">
          {recording ? "Recording — tap stop when done" : "Adapts to your task automatically"}
        </span>

        <div className="ml-auto">
          {busy ? (
            <Button type="button" size="icon" variant="secondary" aria-label="Stop generating" onClick={onStop}>
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              aria-label="Send message"
              onClick={submit}
              disabled={(!text.trim() && !attachments.length) || uploading}
              className="glow-ring"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
