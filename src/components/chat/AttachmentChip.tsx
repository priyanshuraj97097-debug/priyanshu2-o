import { FileText, Film, ImageIcon, Music, Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { Attachment } from "@/lib/chat/types";
import { signedUrl } from "@/lib/uploads";

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Film;
  if (mime.startsWith("audio/")) return Music;
  if (mime === "application/pdf" || mime.startsWith("text/")) return FileText;
  return Paperclip;
}

export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  const Icon = iconFor(attachment.mime);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/70 px-2.5 py-1.5 text-xs">
      <Icon className="size-3.5 shrink-0 text-primary" />
      <span className="max-w-[10rem] truncate">{attachment.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (attachment.mime.startsWith("image/") || attachment.mime.startsWith("video/")) {
      void signedUrl(attachment.path).then((value) => {
        if (active) setUrl(value);
      });
    }
    return () => {
      active = false;
    };
  }, [attachment.path, attachment.mime]);

  if (attachment.mime.startsWith("image/") && url) {
    return (
      <img
        src={url}
        alt={attachment.name}
        loading="lazy"
        className="max-h-64 w-auto rounded-xl border border-border object-cover"
      />
    );
  }
  if (attachment.mime.startsWith("video/") && url) {
    return <video src={url} controls className="max-h-64 rounded-xl border border-border" />;
  }
  return <AttachmentChip attachment={attachment} />;
}