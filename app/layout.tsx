import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import Script from "next/script";
import { AnalyticsPageTracker } from "@/app/ui/analytics-page-tracker";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "700"]
});

export const metadata: Metadata = {
  title: {
    default: "it's alive – Carteira de shows ao vivo",
    template: "%s"
  },
  description: "Carteira de shows, memórias e emoções ao vivo. Guarde setlists, reviva momentos e compartilhe experiências de shows inesquecíveis.",
  metadataBase: new URL("https://itsalivememories.vercel.app"),
  applicationName: "it's alive",
  verification: {
    google: "GLSVY1-8GghT9vTaWp3GhvT_NOHbMbh9Mj3WuK0Tpz4",
  },
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "https://itsalivememories.vercel.app"
  },
  robots: {
    index: true,
    follow: true
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
    shortcut: ["/icon"]
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://itsalivememories.vercel.app",
    title: "it's alive – Carteira de shows ao vivo",
    description: "Memórias intensas dos seus shows, sempre vivas. Setlists, detalhes e emoções de cada show que você viveu.",
    siteName: "it's alive",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "it's alive – memórias e emoções ao vivo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "it's alive – Carteira de shows ao vivo",
    description: "Guarde cada show como uma lembrança viva. Setlists, detalhes e emoções.",
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
      <body className={workSans.className}>
        {children}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
            `
          }}
        />
        <AnalyticsPageTracker />
      </body>
    </html>
  );
}
