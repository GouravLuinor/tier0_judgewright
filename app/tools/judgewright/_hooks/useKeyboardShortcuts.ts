"use client";

import { useEffect } from "react";
import { copyTextToClipboard } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { useToolStore } from "../_store/useToolStore";

/**
 * The required keyboard set (BAR §2.6):
 *   ⌘K / ⌃K  toggle the command palette
 *   ⌘P / ⌃P  toggle the inline samples menu
 *   ⌘⇧C / ⌃⇧C  copy the current output (lime success · rose failure toast)
 *   ⌘↵ / ⌃↵  focus the primary input (rAF-deferred)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;

      const {
        isCommandPaletteOpen,
        setCommandPaletteOpen,
        isSamplesOpen,
        setSamplesOpen,
        stats,
      } = useToolStore.getState();

      const key = e.key.toLowerCase();

      if (key === "k" && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
        return;
      }

      if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        setSamplesOpen(!isSamplesOpen);
        return;
      }

      if (key === "c" && e.shiftKey) {
        if (!stats) return;
        e.preventDefault();
        void copyTextToClipboard(stats.echo).then((succeeded) => {
          if (succeeded) {
            toast({ title: "Verdicts copied", description: "the analyzed paste" });
          } else {
            toast({ title: "Copy failed", variant: "destructive" });
          }
        });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        requestAnimationFrame(() => {
          document.getElementById("tool-verdicts-input")?.focus();
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
