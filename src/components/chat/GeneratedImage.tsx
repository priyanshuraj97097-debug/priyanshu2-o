import { useEffect, useState } from "react";

/**
 * Renders an AI-generated image with the Priyanshu 2.o watermark baked into the
 * pixels, so the watermark survives saving or sharing the picture.
 */
export function GeneratedImage({ url, prompt }: { url: string; prompt: string }) {
  const [src, setSrc] = useState(url);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    const watermark = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const bitmap = await createImageBitmap(await response.blob());
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

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((value) => resolve(value), "image/png"),
        );
        if (!blob || cancelled) return;
        revoke = URL.createObjectURL(blob);
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

  return (
    <figure className="my-3">
      <img
        src={src}
        alt={prompt}
        loading="lazy"
        className="max-h-[26rem] w-auto rounded-2xl border border-border glow-ring"
      />
      <figcaption className="mt-2 text-xs text-muted-foreground">{prompt}</figcaption>
    </figure>
  );
}
