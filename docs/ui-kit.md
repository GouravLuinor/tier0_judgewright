# Tier-0 UI kit

`components/ui/` primitives, their contract, and the rules that keep them consistent. The
visual rules come from [`DESIGN.md`](../DESIGN.md) ("Reference Target"). Every primitive ships
default, hover, focus-visible, active and disabled states; if you add one, it ships them too.

| Component | Transport | Contract |
|---|---|---|
| `button.tsx` | `variant` (`default` \| `outline` \| `ghost`), `size` (`sm` \| `default` \| `lg` \| `icon`), `isLoading` | `default` is the select patch, one per region. 3px radius, 2px select focus ring, `active:translate-y-px`, disabled opacity. |
| `dialog.tsx` | Radix `Dialog` + overlay | Focus trap and Escape are free; `[&>button]:hidden` in the palette hides the generic close button in favour of Escape. |
| `dropdown-menu.tsx` | Radix `DropdownMenu` | **Inline** menu, never a modal. `shadow-pop`, 3px radius. |
| `textarea.tsx` | `mono`, `invalid` | `invalid` switches the border and ring to `miss`; `mono` applies Fragment Mono at `text-xs`. |
| `keycap.tsx` | `size` (`xs` \| `sm` \| `md`) | The chord legend. Always mono, always a 1px border. |
| `toast.tsx` | Module store + `Toaster` | A patch swatch marks the tone (agree for success, miss for failure); `data-toast-variant` for e2e. CSS-only exit. |

## Rules

1. Colours only from the tokens in `app/globals.css`, by their Tailwind names.
2. Each state colour has one job: agree, miss, caution, select. Never decoration.
3. No `framer-motion`, no CSS-in-JS, no new runtime dependency without a bundle-budget case.
4. Never ship `hover:` without `focus-visible:`.
5. `Keycap` is the only way a chord is rendered.
6. Toasts are the only transient overlay feedback; never a second toast system.
