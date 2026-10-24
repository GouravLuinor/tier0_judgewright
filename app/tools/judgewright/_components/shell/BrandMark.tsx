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

/** The Nor AI logo, served from /public (no network egress). Sits on a light chip so it reads on the bezel. */
export function NorAiMark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 160px static asset, fixed size
    <img
      src="/nor-ai-mark.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 rounded-full bg-bezel-ink", className)}
    />
  );
}
