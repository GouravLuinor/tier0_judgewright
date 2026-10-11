# Tier-0 UI kit

`components/ui/` primitives, their contract, and the rules that keep them consistent. Every
primitive ships all five interaction states (BAR §2.5); if you add one, it ships them too.

| Component | Transport | Contract |
|---|---|---|
| `button.tsx` | `variant` (`default` \| `outline` \| `ghost` \| `cyan` \| `emerald` \| `danger`), `size` (`sm` \| `default` \| `lg` \| `icon`), `isLoading` | Lime ring on focus-visible, `active:scale-[0.97]`, disabled opacity. |
| `badge.tsx` | `variant` (`default` \| `emerald` \| `cyan` \| `violet` \| `amber` \| `rose` \| `outline`) | Mono, hairline border, semantic color per variant. |
| `dialog.tsx` | Radix `Dialog` + overlay | Focus trap and Escape are free; `[&>button]:hidden` in the palette hides the generic close button in favor of Escape. |
| `dropdown-menu.tsx` | Radix `DropdownMenu` | **Inline** menu — never a modal. |
| `input.tsx` / `textarea.tsx` | `mono`, `invalid` | `invalid` switches the border + ring to rose; `mono` applies the JetBrains Mono stack with `text-xs`. |
| `keycap.tsx` | `size` (`xs` \| `sm` \| `md`) | The chord legend. Always mono, always a 1px hairline border. |
| `skeleton.tsx` | `className` | `aria-hidden`, `animate-pulse` with `motion-reduce:animate-none`. |
| `tabs.tsx` | Radix `Tabs` | Active trigger is lime-tinted with a lime ring; only the active tab mounts. |
| `toast.tsx` | Module store + `Toaster` | Success = lime, failure = rose, `data-toast-variant` for e2e. CSS-only exit (no animation runtime). |
| `tooltip.tsx` | Radix `Tooltip` | Strictly for inline affordance hints; must not gate content the aria label already carries. |

## Rules

1. Colors only from the Matchlight ladder + inverted zinc neutrals.
2. One accent (lime). Semantic state colors (amber/rose) only for warning/error.
3. No `framer-motion`, no CSS-in-JS, no new runtime dependency without a bundle-budget case.
4. Never ship `hover:` without `focus-visible:`.
5. `Keycap` is the only way a chord is rendered — no ad-hoc `⌘K` strings.
6. Toasts are the only transient overlay feedback; never a second toast system.
