import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      isLoading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-medium select-none rounded-[3px] transition-[background-color,border-color,color,transform] duration-150 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px motion-reduce:transition-none touch-manipulation";

    // default = the one primary action per region (the selection patch);
    // outline = secondary; ghost = tertiary. cyan/emerald/danger are kept as
    // aliases for older call sites.
    const variantStyles = {
      default: "bg-select text-white border border-select hover:bg-select/90 dark:text-bezel",
      outline: "bg-panel text-ink border border-line hover:border-line-strong hover:bg-sunk",
      ghost: "bg-transparent text-ink-2 hover:bg-sunk hover:text-ink",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-sm",
      default: "h-10 px-4 text-sm",
      lg: "h-12 px-5 text-base",
      icon: "h-10 w-10 p-0",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
