import { ImageResponse } from "next/og";
import { BrandIconSvg } from "@/lib/brand-svg";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
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
            width: 360,
            height: 290
          }}
        />
      </div>
    ),
    size
  );
}
