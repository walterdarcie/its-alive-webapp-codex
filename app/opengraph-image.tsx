import { ImageResponse } from "next/og";
import { BrandDefaultSvg, BrandIconSvg } from "@/lib/brand-svg";

export const runtime = "edge";
export const alt = "it's alive - memórias e emoções ao vivo";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 15% 15%, rgba(236,0,140,0.22), transparent 42%), radial-gradient(circle at 82% 12%, rgba(252,103,103,0.22), transparent 46%), #081226",
          padding: "52px 64px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <BrandDefaultSvg style={{ width: 356, height: 136 }} />
          <BrandIconSvg style={{ width: 102, height: 82 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
          <div style={{ color: "#F3F4F6", fontSize: 62, lineHeight: 1.03, fontWeight: 700 }}>
            Memórias intensas dos seus shows, sempre vivas.
          </div>
          <div style={{ color: "#B9BFCB", fontSize: 30, lineHeight: 1.25 }}>
            Carteira de shows com emoções ao vivo, setlists e lembranças para levar no bolso.
          </div>
        </div>
      </div>
    ),
    size
  );
}
