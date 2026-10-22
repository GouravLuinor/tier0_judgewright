import { ImageResponse } from "next/og";

// Judgewright's mark at icon scale: a two-by-two chip off the reference
// target on the bezel. Top row is the reference, bottom row the measurement;
// the bottom-right patch is the one the judge got wrong. Hex values mirror
// the --bezel, --agree, --wedge-4 and --miss tokens in globals.css.
const BEZEL = "#1e1e1d";
const AGREE = "#67bdaa";
const NEUTRAL = "#c8c8c8";
const MISS = "#c15a63";

const BASE_SIZE = 32;

export function JudgewrightMark({ size }: { size: number }) {
  const u = size / BASE_SIZE;
  const patch = 11 * u;
  const gap = 2 * u;
  const fills = [AGREE, NEUTRAL, NEUTRAL, MISS];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BEZEL,
        borderRadius: 5 * u,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", width: patch * 2 + gap, gap }}>
        {fills.map((fill, i) => (
          <div key={i} style={{ width: patch, height: patch, background: fill, borderRadius: 1.5 * u }} />
        ))}
      </div>
    </div>
  );
}

export const size = { width: BASE_SIZE, height: BASE_SIZE };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<JudgewrightMark size={size.width} />, { ...size });
}
