import mark from "@/assets/priyanshu-mark.png";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={mark}
      alt="Priyanshu 2.o"
      className={cn("size-8 select-none object-contain drop-shadow-[0_0_12px_oklch(0.7_0.17_260/0.5)]", className)}
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