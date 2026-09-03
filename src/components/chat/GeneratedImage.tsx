import { Download, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Renders an AI-generated image with the Priyanshu 2.o watermark baked into the
 * pixels (so it survives saving), plus download and full-screen viewing.
 * The original resolution is preserved — the canvas matches the source bitmap.
 */
export function GeneratedImage({ url, prompt }: { url: string; prompt: string }) {
  const [src, setSrc] = useState(url);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    const watermark = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const original = await response.blob();
        const bitmap = await createImageBitmap(original);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);

        const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.028);
        const size = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.042));
        ctx.font = `600 ${size}px Sora, Manrope, system-ui, sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        const label = "Priyanshu 2.o";
        const metrics = ctx.measureText(label);
        const boxW = metrics.width + size * 1.1;
        const boxH = size * 1.7;
        const x = canvas.width - pad;
        const y = canvas.height - pad;

        ctx.globalAlpha = 0.42;
        ctx.fillStyle = "#05060f";
        ctx.beginPath();
        const radius = boxH / 2;
        const left = x - boxW;
        const top = y - boxH;
        ctx.moveTo(left + radius, top);
        ctx.arcTo(x, top, x, y, radius);
        ctx.arcTo(x, y, left, y, radius);
        ctx.arcTo(left, y, left, top, radius);
        ctx.arcTo(left, top, x, top, radius);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.95;
        const gradient = ctx.createLinearGradient(left, top, x, y);
        gradient.addColorStop(0, "#67e8f9");
        gradient.addColorStop(0.5, "#a78bfa");
        gradient.addColorStop(1, "#f472b6");
        ctx.fillStyle = gradient;
        ctx.fillText(label, x - size * 0.55, y - size * 0.35);

        const output = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((value) => resolve(value), "image/png"),
        );
        if (!output || cancelled) return;
        revoke = URL.createObjectURL(output);
        setBlob(output);
        setSrc(revoke);
      } catch {
        /* keep the original image if watermarking is unavailable */
      }
    };

    void watermark();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const download = async () => {
    try {
      const data = blob ?? (await (await fetch(url)).blob());
      const href = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `priyanshu-2o-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch {
      toast.error("Could not download the image.");
    }
  };

  const alt = prompt.length > 140 ? `${prompt.slice(0, 137)}…` : prompt;

  return (
    <>
      <figure className="group/image relative my-3 inline-block">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open image full screen"
          className="block cursor-zoom-in rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="max-h-[26rem] w-auto rounded-2xl border border-border glow-ring"
          />
        </button>
        <div className="absolute right-2 top-2 flex gap-1 opacity-90 transition-opacity md:opacity-0 md:group-hover/image:opacity-100 md:group-focus-within/image:opacity-100">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8 rounded-full shadow"
            aria-label="Download image"
            onClick={() => void download()}
          >
            <Download className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8 rounded-full shadow"
            aria-label="View full screen"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </figure>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generated image viewer"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="absolute right-3 top-3 flex gap-2 pt-[env(safe-area-inset-top)]">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="rounded-full"
              aria-label="Download image"
              onClick={(event) => {
                event.stopPropagation();
                void download();
              }}
            >
              <Download className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="rounded-full"
              aria-label="Close viewer"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
            >
              <X className="size-5" />
            </Button>
          </div>
          <img
            src={src}
            alt={alt}
            className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
