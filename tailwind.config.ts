import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Judgewright "Reference Target" tokens. Values live in app/globals.css as RGB
 * triplets (:root = light, .dark = dark) so `/opacity` modifiers work.
 * Colours come only from these names; no default Tailwind palette.
 */
const rgb = (token: string) => `rgb(var(${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: rgb("--ground"),
        panel: rgb("--panel"),
        sunk: rgb("--sunk"),
        line: { DEFAULT: rgb("--line"), strong: rgb("--line-strong") },
        ink: { DEFAULT: rgb("--ink"), 2: rgb("--ink-2"), 3: rgb("--ink-3") },
        bezel: {
          DEFAULT: rgb("--bezel"),
          raised: rgb("--bezel-raised"),
          line: rgb("--bezel-line"),
          ink: rgb("--bezel-ink"),
          muted: rgb("--bezel-muted"),
        },
        agree: { DEFAULT: rgb("--agree"), ink: rgb("--agree-ink") },
        miss: { DEFAULT: rgb("--miss"), ink: rgb("--miss-ink") },
        caution: { DEFAULT: rgb("--caution"), ink: rgb("--caution-ink") },
        select: { DEFAULT: rgb("--select"), ink: rgb("--select-ink") },
        wedge: {
          0: rgb("--wedge-0"),
          1: rgb("--wedge-1"),
          2: rgb("--wedge-2"),
          3: rgb("--wedge-3"),
          4: rgb("--wedge-4"),
          5: rgb("--wedge-5"),
        },
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-fragment-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // The verdict figure: display size, tight leading.
        figure: ["clamp(3.5rem, 2.2rem + 4vw, 5.5rem)", { lineHeight: "0.9", letterSpacing: "-0.03em" }],
      },
      boxShadow: {
        // One depth: a panel lifted a hair off the grey card.
        lift: "0 1px 0 rgb(var(--ink) / 0.04), 0 8px 24px -12px rgb(var(--ink) / 0.18)",
        pop: "0 18px 48px -16px rgb(0 0 0 / 0.45)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
