import { ImageResponse } from "next/og";
import { BrandDefaultSvg } from "@/lib/brand-svg";

export const runtime = "edge";
export const alt = "it's alive - memórias de shows";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(160deg, rgba(236,0,140,0.18) 0%, rgba(8,18,38,1) 38%), radial-gradient(circle at 92% 18%, rgba(252,103,103,0.2), transparent 48%), #081226",
          padding: "56px 68px"
        }}
      >
        <BrandDefaultSvg style={{ width: 392, height: 150 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 920 }}>
          <div style={{ color: "#F3F4F6", fontSize: 58, lineHeight: 1.04, fontWeight: 700 }}>Guarde cada show como uma lembrança viva.</div>
          <div style={{ color: "#B9BFCB", fontSize: 30, lineHeight: 1.24 }}>Descubra, marque “eu vou/eu fui” e monte sua carteira emocional de shows.</div>
        </div>
      </div>
    ),
    size
  );
}
