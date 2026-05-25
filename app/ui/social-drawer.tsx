"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLocale } from "@/lib/i18n-context";
import { trackEvent } from "@/lib/analytics";

type SocialDrawerProps = {
  open: boolean;
  onClose: () => void;
  source: string;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="iconSvg">
      <path
        d="M6 6 L18 18 M18 6 L6 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function SocialDrawer({ open, onClose, source }: SocialDrawerProps) {
  const { t } = useLocale();

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        trackEvent("social_drawer_close", { source, reason: "escape" });
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, source]);

  async function signOut() {
    trackEvent("sign_out_click", { source: `${source}_drawer` });
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  if (!open) return null;

  return (
    <div className="drawerRoot" role="dialog" aria-modal="true" aria-label={t.drawer.menuLabel}>
      <button
        type="button"
        className="drawerBackdrop"
        aria-label={t.drawer.closeLabel}
        onClick={() => {
          trackEvent("social_drawer_close", { source, reason: "backdrop" });
          onClose();
        }}
      />
      <aside className="drawer">
        <button
          type="button"
          className="drawerCloseBtn"
          aria-label={t.drawer.closeLabel}
          onClick={() => {
            trackEvent("social_drawer_close", { source, reason: "close_button" });
            onClose();
          }}
        >
          <CloseIcon />
        </button>

        <nav className="drawerSection drawerSectionPrimary" aria-label={t.drawer.navLabel}>
          <Link
            href="/?tab=meus-shows"
            className="drawerItem"
            style={{ animationDelay: "120ms" }}
            onClick={() => {
              trackEvent("drawer_nav_click", { source, target: "meus_shows" });
              onClose();
            }}
          >
            {t.drawer.myShows}
          </Link>
          <Link
            href="/search?tab=shows"
            className="drawerItem"
            style={{ animationDelay: "160ms" }}
            onClick={() => {
              trackEvent("drawer_nav_click", { source, target: "buscar_shows" });
              onClose();
            }}
          >
            {t.drawer.searchShows}
          </Link>
          <Link
            href="/search?tab=amigos"
            className="drawerItem"
            style={{ animationDelay: "200ms" }}
            onClick={() => {
              trackEvent("drawer_nav_click", { source, target: "buscar_amigos" });
              onClose();
            }}
          >
            {t.drawer.searchFriends}
          </Link>
        </nav>

        <nav className="drawerSection drawerSectionSecondary" aria-label={t.drawer.accountLabel}>
          <Link
            href="/terms"
            className="drawerItem drawerItemSm"
            style={{ animationDelay: "240ms" }}
            onClick={() => {
              trackEvent("drawer_nav_click", { source, target: "terms" });
              onClose();
            }}
          >
            {t.drawer.terms}
          </Link>
          <Link
            href="/privacy"
            className="drawerItem drawerItemSm"
            style={{ animationDelay: "280ms" }}
            onClick={() => {
              trackEvent("drawer_nav_click", { source, target: "privacy" });
              onClose();
            }}
          >
            {t.drawer.privacy}
          </Link>
          <button
            type="button"
            className="drawerItem drawerItemSm drawerItemBtn"
            style={{ animationDelay: "320ms" }}
            onClick={() => {
              void signOut();
            }}
          >
            {t.drawer.signOut}
          </button>
        </nav>
      </aside>
    </div>
  );
}
