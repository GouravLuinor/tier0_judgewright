"use client";

import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Keycap } from "@/components/ui/keycap";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SAMPLE_SETS } from "../../_lib/presets";
import { useToolStore } from "../../_store/useToolStore";

/**
 * The samples menu (⌘P). Each set is synthetic and says what it demonstrates,
 * so a first-time visitor can see the report catch something before pasting
 * their own data. The panel instance owns the shared ⌘P state; the header
 * copy keeps its own, so the two menus never open (and dismiss) together.
 */
export function SamplesMenu({ tone = "panel" }: { tone?: "panel" | "bezel" }) {
  const sharedOpen = useToolStore((s) => s.isSamplesOpen);
  const setSharedOpen = useToolStore((s) => s.setSamplesOpen);
  const [localOpen, setLocalOpen] = useState(false);
  const isSamplesOpen = tone === "bezel" ? localOpen : sharedOpen;
  const setSamplesOpen = tone === "bezel" ? setLocalOpen : setSharedOpen;
  const setVerdictsText = useToolStore((s) => s.setVerdictsText);
  const setRubric = useToolStore((s) => s.setRubric);

  return (
    <DropdownMenu open={isSamplesOpen} onOpenChange={setSamplesOpen}>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-[3px] px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2",
          tone === "bezel"
            ? "text-bezel-muted hover:bg-bezel-raised hover:text-bezel-ink focus-visible:ring-offset-bezel"
            : "border border-line bg-panel text-ink hover:border-line-strong hover:bg-sunk focus-visible:ring-offset-ground"
        )}
      >
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        Samples
        {tone === "bezel" ? (
          <Keycap className="hidden border-bezel-line bg-bezel-raised text-bezel-muted lg:inline-flex">⌘P</Keycap>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-normal text-ink-3">
          Synthetic sets, each built to show one thing
        </DropdownMenuLabel>
        {SAMPLE_SETS.map((set) => (
          <DropdownMenuItem
            key={set.id}
            onSelect={() => {
              setVerdictsText(set.verdicts);
              setRubric(set.rubric);
              toast({ title: "Sample loaded", description: set.name });
            }}
            className="flex-col items-start gap-0.5 py-2"
          >
            <span className="text-sm text-ink">{set.name}</span>
            <span className="text-xs text-ink-3">{set.blurb}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
