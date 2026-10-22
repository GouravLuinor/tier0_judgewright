"use client";

import { copyTextToClipboard } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { renderOneLineVerdict } from "../../_lib/reportRender";
import type { CalibrationReport } from "../../_lib/types";

/** Saves text as a file through a Blob URL; false when the browser blocks it. */
export function downloadText(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Copies one export artifact and toasts the outcome, naming the fallback on failure. */
export async function copyArtifact(label: string, text: string): Promise<void> {
  const ok = await copyTextToClipboard(text);
  if (ok) {
    toast({ title: `${label} copied` });
  } else {
    toast({
      title: `Could not copy ${label}`,
      description: "Your browser blocked the clipboard. Use Download instead.",
      variant: "destructive",
    });
  }
}

/** The ⌘⇧C action: the one-line verdict, shared by the chord and the button. */
export async function copyOneLineVerdict(report: CalibrationReport): Promise<void> {
  const ok = await copyTextToClipboard(renderOneLineVerdict(report));
  if (ok) {
    toast({ title: "Verdict copied", description: "The one-line verdict is on your clipboard." });
  } else {
    toast({
      title: "Copy failed",
      description: "Your browser blocked the clipboard.",
      variant: "destructive",
    });
  }
}
