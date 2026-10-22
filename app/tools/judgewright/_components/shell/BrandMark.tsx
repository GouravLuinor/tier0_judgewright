import { cn } from "@/lib/utils";

/**
 * Judgewright's mark: a two-by-two chip off the reference target. Top row is
 * the reference, bottom row the measurement; the bottom-right patch is the
 * one the judge got wrong.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid h-6 w-6 shrink-0 grid-cols-2 gap-[2px]", className)}
    >
      <span className="patch bg-agree" />
      <span className="patch bg-wedge-4" />
      <span className="patch bg-wedge-4" />
      <span className="patch bg-miss" />
    </span>
  );
}

/** The Nor AI family mark: the shared "N" chip, drawn in this tool's palette. */
export function NorAiMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-[2px] bg-bezel-ink text-[11px] font-bold leading-none text-bezel",
        className
      )}
    >
      N
    </span>
  );
}
