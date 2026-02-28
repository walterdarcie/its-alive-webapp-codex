import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "700"]
});

export const metadata: Metadata = {
  title: "it's alive",
  description: "Carteira de shows, memórias e emoções ao vivo.",
  metadataBase: new URL("https://itsalivememories.vercel.app"),
  applicationName: "it's alive",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
    shortcut: ["/icon"]
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://itsalivememories.vercel.app",
    title: "it's alive",
    description: "Memórias intensas dos seus shows, sempre vivas.",
    siteName: "it's alive",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "it's alive - memórias e emoções ao vivo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "it's alive",
    description: "Guarde cada show como uma lembrança viva.",
    images: ["/twitter-image"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={workSans.className}>{children}</body>
    </html>
  );
}
