export const GA_MEASUREMENT_ID = "G-LDQLEFB0DR";

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function isAnalyticsReady() {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

export function trackPageView(url: string) {
  if (!isAnalyticsReady()) return;
  window.gtag?.("event", "page_view", {
    page_path: url,
    page_location: `${window.location.origin}${url}`,
    page_title: document.title
  });
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}) {
  if (!isAnalyticsReady()) return;
  window.gtag?.("event", eventName, params);
}
