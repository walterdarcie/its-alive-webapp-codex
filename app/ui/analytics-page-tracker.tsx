"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

export function AnalyticsPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const query = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
    const url = query ? `${pathname}?${query}` : pathname;
    trackPageView(url);
  }, [pathname]);

  return null;
}
