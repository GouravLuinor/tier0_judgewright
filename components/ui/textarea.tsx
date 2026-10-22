import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  mono?: boolean;
  invalid?: boolean;
}

function Textarea({
  className,
  mono = false,
  invalid = false,
  disabled,
  ...props
}: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      disabled={disabled}
      className={cn(
        "flex min-h-20 w-full rounded-[3px] border border-line bg-panel px-3 py-2.5 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 sm:text-sm",
        "hover:border-line-strong focus-visible:border-select focus-visible:ring-1 focus-visible:ring-select",
        "disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        mono && "font-mono text-[13px] leading-relaxed sm:text-xs",
        invalid && "border-miss focus-visible:border-miss focus-visible:ring-miss",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
