"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastOptions {
  title: string;
  description?: string;
  /** `default` is the success state (select) — BAR §2.5 copy feedback. */
  variant?: "default" | "destructive";
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  /** Set while the exit animation runs; the item is removed afterwards. */
  exiting?: boolean;
}

const DEFAULT_DURATION = 2000;
const MAX_VISIBLE = 5;
const EXIT_MS = 180;

let toasts: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function toast(options: ToastOptions): number {
  const id = ++nextId;
  toasts = [...toasts, { ...options, id }].slice(-MAX_VISIBLE);
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), options.duration ?? DEFAULT_DURATION);
  }
  return id;
}

export function dismissToast(id: number): void {
  const target = toasts.find((t) => t.id === id);
  if (!target || target.exiting) return;

  // Play the exit transition, then detach — CSS only, so the bundle stays
  // inside the First Load JS budget (context.md §4.1) and the global
  // prefers-reduced-motion kill-switch still neutralises it.
  toasts = toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t));
  emit();
  window.setTimeout(() => {
    const before = toasts.length;
    toasts = toasts.filter((t) => t.id !== id);
    if (toasts.length !== before) emit();
  }, EXIT_MS);
}

function useToasts(): ToastItem[] {
  const [items, setItems] = React.useState<ToastItem[]>(toasts);
  React.useEffect(() => {
    const sync = () => setItems(toasts);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return items;
}

// Toasts are bezel slips; the patch square names the outcome, the title says it.
const patchTone = {
  default: "bg-agree",
  destructive: "bg-miss",
} as const;

function Toaster() {
  const items = useToasts();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col-reverse gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          data-toast-variant={
            item.variant === "destructive" ? "error" : "success"
          }
          className={cn(
            "pointer-events-auto flex w-full items-start gap-3 rounded-[3px] border border-bezel-line bg-bezel p-3 text-bezel-ink shadow-pop motion-reduce:transition-none",
            item.exiting
              ? "animate-out fade-out-0 slide-out-to-right-4 zoom-out-95"
              : "animate-in fade-in-0 slide-in-from-right-4 zoom-in-95"
          )}
        >
          <span
            aria-hidden="true"
            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[2px]", patchTone[item.variant ?? "default"])}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium leading-none tracking-tight">
              {item.title}
            </p>
            {item.description ? (
              <p
                className="text-xs leading-relaxed text-bezel-muted"
              >
                {item.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss notification"
            className="ml-auto shrink-0 rounded-[3px] p-1 text-bezel-muted opacity-80 transition-[opacity,background-color,transform] duration-150 ease-out-expo hover:bg-bezel-raised hover:text-bezel-ink hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select/70 focus-visible:opacity-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

export { Toaster };
