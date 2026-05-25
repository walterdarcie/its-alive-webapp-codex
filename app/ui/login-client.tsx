"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n-context";
import { trackEvent } from "@/lib/analytics";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.61Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.84.87-3.06.87-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC04"
        d="M3.95 10.71A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.15.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="iconSvg">
      <path
        d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79L20 21.5 21.5 20l-6-6Zm-6 0A4.5 4.5 0 1 1 10 5a4.5 4.5 0 0 1-.5 9Z"
        fill="currentColor"
      />
    </svg>
  );
}

type LoginClientProps = {
  initialErrorKey?: string;
  nextUrl?: string;
};

export function LoginClient({ initialErrorKey, nextUrl }: LoginClientProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(getErrorMessageByKey(initialErrorKey, t));
  const router = useRouter();

  async function onGoogleLogin() {
    setLoading(true);
    setError(null);
    trackEvent("login_google_click", { source: "landing_page" });
    try {
      const supabase = getSupabaseBrowserClient();
      const afterLogin = nextUrl ?? "/";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(afterLogin)}`;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo
        }
      });
      if (signInError) {
        throw signInError;
      }
    } catch (signInError) {
      trackEvent("login_google_error", { source: "landing_page" });
      setError(signInError instanceof Error ? signInError.message : t.login.errorGoogle);
      setLoading(false);
    }
  }

  function handleSearchClick() {
    trackEvent("landing_search_cta_click", { source: "landing_page" });
    router.push("/search");
  }

  return (
    <main className="loginPage">

      <div className="landingContainer">
        <Image src="/brand/logo-default.svg" alt="it's alive" width={180} height={52} className="loginLogo landingLogo" priority />

        <section className="landingBlock landingBlockSearch">
          <div className="loginCopy">
            <h1 className="loginTitle">{t.login.title}</h1>
            <p className="loginSubtitle">{t.login.subtitle}</p>
          </div>

          <button type="button" className="landingSearchCta" onClick={handleSearchClick}>
            <SearchIcon />
            <span className="landingSearchCtaLabel">{t.login.searchCta}</span>
          </button>
        </section>

        <div className="landingDivider">
          <span className="landingDividerLine" aria-hidden />
          <span className="landingDividerText">{t.common.or}</span>
          <span className="landingDividerLine" aria-hidden />
        </div>

        <section className="landingBlock landingBlockLogin">
          <p className="landingLoginHint">{t.login.loginHint}</p>

          <button type="button" className={`ctaMain loginGoogleButton loginGoogleButtonSecondary ${loading ? "isLoading" : ""}`} onClick={onGoogleLogin} disabled={loading}>
            <span className="loginGoogleIcon">
              <GoogleIcon />
            </span>
            <span className="ctaMainLabel">{loading ? t.login.connecting : t.login.loginGoogle}</span>
          </button>

          {error ? <p className="errorBox loginError">{error}</p> : null}
        </section>

        <div className="loginLegalLinks">
          <Link
            href="/terms"
            onClick={() => {
              trackEvent("login_terms_click", { source: "landing_page" });
            }}
          >
            {t.login.terms}
          </Link>
          <span aria-hidden>•</span>
          <Link
            href="/privacy"
            onClick={() => {
              trackEvent("login_privacy_click", { source: "landing_page" });
            }}
          >
            {t.login.privacy}
          </Link>
        </div>
      </div>
    </main>
  );
}

function getErrorMessageByKey(errorKey: string | undefined, t: ReturnType<typeof useLocale>["t"]) {
  if (!errorKey) return null;
  if (errorKey === "supabase_not_configured") return t.login.errorSupa;
  if (errorKey === "oauth_callback_failed") return t.login.errorOAuth;
  return null;
}
