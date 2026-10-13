"use client";

import React, { useState } from "react";
import { BookOpen, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { GUIDE_TABS } from "../_lib/guide";
import { SITE } from "@/lib/site";

export function KnowledgeDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-surface-border bg-surface-subtle text-xs text-zinc-300 hover:bg-surface-elevated hover:text-zinc-100"
        >
          <HelpCircle className="h-3.5 w-3.5 text-brand-lime" aria-hidden="true" />
          <span>Guide &amp; Schema</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-surface-border bg-surface-base p-6 text-zinc-200">
        <DialogHeader className="border-b border-surface-border pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <BookOpen className="h-5 w-5 text-brand-lime" />
            <span>Judgewright Documentation &amp; Reference</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Input schema shapes, column mapping rules, chance-corrected formulas, and evaluation guides.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="schema" className="mt-4 w-full">
          <TabsList className="grid w-full grid-cols-3 gap-1 bg-surface-subtle">
            <TabsTrigger value="schema" className="text-xs font-mono">
              Schema &amp; Aliases
            </TabsTrigger>
            <TabsTrigger value="math" className="text-xs font-mono">
              Reliability &amp; Math
            </TabsTrigger>
            <TabsTrigger value="faq" className="text-xs font-mono">
              FAQ
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Schema */}
          <TabsContent value="schema" className="mt-4 space-y-4">
            <div className="space-y-3">
              {GUIDE_TABS.slice(0, 3).map((tab) => (
                <div
                  key={tab.id}
                  className="rounded-xl border border-surface-border bg-surface-subtle/30 p-4"
                >
                  <h4 className="font-mono text-xs font-semibold text-brand-lime uppercase tracking-wide">
                    {tab.title}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {tab.blurb}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-surface-border bg-surface-base p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                    <code>{tab.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 2: Math */}
          <TabsContent value="math" className="mt-4 space-y-4">
            {GUIDE_TABS.slice(3).map((tab) => (
              <div
                key={tab.id}
                className="rounded-xl border border-surface-border bg-surface-subtle/30 p-4"
              >
                <h4 className="font-mono text-xs font-semibold text-brand-lime uppercase tracking-wide">
                  {tab.title}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {tab.blurb}
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-surface-border bg-surface-base p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                  <code>{tab.code}</code>
                </pre>
              </div>
            ))}
          </TabsContent>

          {/* TAB 3: FAQ */}
          <TabsContent value="faq" className="mt-4 space-y-3">
            {SITE.faqs.map((faq, i) => (
              <div
                key={faq.q}
                className="rounded-xl border border-surface-border bg-surface-subtle/30 p-3.5"
              >
                <h4 className="text-xs font-semibold text-zinc-200">
                  {i + 1}. {faq.q}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  {faq.a}
                </p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
