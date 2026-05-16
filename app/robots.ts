import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/show/", "/search"],
        disallow: ["/api/", "/auth/"]
      }
    ],
    sitemap: "https://itsalive.fans/sitemap.xml"
  };
}
