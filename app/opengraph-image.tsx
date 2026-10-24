import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { JudgewrightMark } from "./icon";

// The share card: the bezel, the mark, the intent-matching title and the
// six-step agreement wedge with a κ marker, in the same tokens as the page.
export const alt = "Judgewright: calibrate your LLM judge against human labels";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BEZEL = "#1e1e1d";
const PANEL = "#f8f8f6";
const INK = "#1a1a19";
const INK_2 = "#424240";
const SELECT = "#505ba6";
const WEDGE = ["#343434", "#555555", "#6e6e6d", "#a0a0a0", "#c8c8c8", "#f3f3f2"];
const WEDGE_WIDTH = [50, 10, 10, 10, 10, 10];

export default async function OpengraphImage() {
  const mark = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/nor-ai-mark.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BEZEL, padding: 28 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: PANEL,
            borderRadius: 4,
            padding: "56px 64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18, width: "100%" }}>
            <div style={{ width: 56, height: 56, display: "flex" }}>
              <JudgewrightMark size={56} />
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, color: INK }}>Judgewright</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", fontSize: 28, color: INK_2 }}>
              <img src={mark} width={48} height={48} alt="" />
              by Nor AI
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 66, fontWeight: 700, color: INK, lineHeight: 1.05, letterSpacing: -1.5 }}>
              Calibrate your LLM judge against human labels
            </div>
            <div style={{ fontSize: 28, color: INK_2 }}>
              Cohen’s κ with an interval, every disagreement, computed in your browser.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", position: "relative", height: 44, gap: 3 }}>
              {WEDGE.map((fill, i) => (
                <div key={fill} style={{ width: `${WEDGE_WIDTH[i]}%`, height: 44, background: fill, borderRadius: 2 }} />
              ))}
              <div style={{ position: "absolute", left: "70%", top: -10, width: 6, height: 64, background: SELECT, borderRadius: 1 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: INK_2 }}>
              <span>worse than chance</span>
              <span>chance</span>
              <span>almost perfect</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
