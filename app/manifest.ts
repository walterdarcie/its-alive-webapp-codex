import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "it's alive",
    short_name: "it's alive",
    description: "Memórias e emoções vividas em shows ao vivo.",
    start_url: "/",
    display: "standalone",
    background_color: "#081226",
    theme_color: "#081226",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      },
      {
        src: "/brand/logo-icon.svg",
        sizes: "94x76",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
