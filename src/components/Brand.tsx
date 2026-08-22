import mark from "@/assets/priyanshu-mark-logo.png.asset.json";
import { cn } from "@/lib/utils";

export const BRAND_MARK_URL = mark.url;

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={mark.url}
      alt="Priyanshu 2.o"
      className={cn(
        "size-8 select-none rounded-full object-contain drop-shadow-[0_0_12px_oklch(0.7_0.17_260/0.5)]",
        className,
      )}
    />
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-base font-semibold tracking-tight", className)}>
      Priyanshu <span className="aurora-text">2.o</span>
    </span>
  );
}
