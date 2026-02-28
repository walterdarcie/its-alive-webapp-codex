import { ImageResponse } from "next/og";
import { BrandIconSvg } from "@/lib/brand-svg";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#081226"
        }}
      >
        <BrandIconSvg
          style={{
            width: 124,
            height: 100
          }}
        />
      </div>
    ),
    size
  );
}
