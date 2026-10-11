import { ImageResponse } from "next/og";

// Judgewright's mark at icon scale: a scale/balance glyph — the instrument
// weighs a verdict — drawn with the reserved brand-lime accent on the dark
// canvas token so it reads identically on light and dark browser chrome.
const TILE_BG = "#0c0e0b"; // dark canvas token
const TILE_HAIRLINE = "#2e3328"; // dark surface-border token
const LIME = "#bef264"; // dark brand-lime token — the one accent

const BASE_SIZE = 32;

export function JudgewrightMark({ size }: { size: number }) {
  const u = size / BASE_SIZE;
  const stroke = 2 * u;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: TILE_BG,
        borderRadius: 8 * u,
        border: `${1 * u}px solid ${TILE_HAIRLINE}`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1 * u,
        }}
      >
        {/* the beam */}
        <div
          style={{
            width: 20 * u,
            height: stroke,
            background: LIME,
            borderRadius: stroke / 2,
          }}
        />
        {/* the two pans, hung from the beam */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 * u }}>
          {[0, 1].map((pan) => (
            <div
              key={pan}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1 * u,
              }}
            >
              <div
                style={{
                  width: stroke,
                  height: 5 * u,
                  background: LIME,
                  borderRadius: stroke / 2,
                }}
              />
              <div
                style={{
                  width: 9 * u,
                  height: 5 * u,
                  background: LIME,
                  borderRadius: `${4 * u}px ${4 * u}px ${2 * u}px ${2 * u}px`,
                  opacity: pan === 0 ? 1 : 0.55,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const size = { width: BASE_SIZE, height: BASE_SIZE };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<JudgewrightMark size={size.width} />, {
    ...size,
  });
}
