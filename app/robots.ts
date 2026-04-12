import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/show/",
        disallow: ["/api/", "/auth/", "/login", "/search"]
      }
    ],
    sitemap: "https://itsalivememories.vercel.app/sitemap.xml"
  };
}
