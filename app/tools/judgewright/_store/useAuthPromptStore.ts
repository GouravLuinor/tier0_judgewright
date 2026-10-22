"use client";

import { create } from "zustand";
import type { AuthTrigger } from "../_lib/authGate";

interface AuthPromptState {
  isOpen: boolean;
  trigger: AuthTrigger | null;
  /** True once the export offer has been shown this session. */
  exportOfferShown: boolean;
  open: (trigger: AuthTrigger) => void;
  /** The after-download offer: shown at most once per session, never a wall. */
  offerAfterExport: () => void;
  close: () => void;
}

export const useAuthPromptStore = create<AuthPromptState>()((set, get) => ({
  isOpen: false,
  trigger: null,
  exportOfferShown: false,
  open: (trigger) => set({ isOpen: true, trigger }),
  offerAfterExport: () => {
    if (get().exportOfferShown) return;
    set({ isOpen: true, trigger: "export", exportOfferShown: true });
  },
  close: () => set({ isOpen: false, trigger: null }),
}));
