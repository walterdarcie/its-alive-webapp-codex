"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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

type LoginClientProps = {
  initialErrorKey?: string;
  nextUrl?: string;
};

function getErrorMessageByKey(errorKey?: string) {
  if (!errorKey) return null;
  if (errorKey === "supabase_not_configured") {
    return "Ambiente de autenticação não configurado no deploy. Verifique as variáveis do Supabase no Vercel.";
  }
  if (errorKey === "oauth_callback_failed") {
    return "Falha no retorno do login com Google. Tente novamente em alguns segundos.";
  }
  return null;
}

export function LoginClient({ initialErrorKey, nextUrl }: LoginClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(getErrorMessageByKey(initialErrorKey));

  async function onGoogleLogin() {
    setLoading(true);
    setError(null);
    trackEvent("login_google_click", { source: "login_page" });
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
      trackEvent("login_google_error", { source: "login_page" });
      setError(signInError instanceof Error ? signInError.message : "Não foi possível iniciar o login com Google.");
      setLoading(false);
    }
  }

  return (
    <main className="loginPage">
      <div className="loginAmbientGlow loginAmbientGlowA" aria-hidden />
      <div className="loginAmbientGlow loginAmbientGlowB" aria-hidden />
      <div className="loginLightBeam" aria-hidden />

      <section className="loginCard">
        <Image src="/brand/logo-default.svg" alt="it's alive" width={180} height={52} className="loginLogo" priority />

        <div className="loginCopy">
          <h1 className="loginTitle">As memórias mais intensas dos seus shows, sempre vivas.</h1>
          <p className="loginSubtitle">Guarde emoções ao vivo, revise sua carteira e compartilhe momentos inesquecíveis.</p>
        </div>

        <button type="button" className={`ctaMain loginGoogleButton ${loading ? "isLoading" : ""}`} onClick={onGoogleLogin} disabled={loading}>
          <span className="loginGoogleIcon">
            <GoogleIcon />
          </span>
          <span className="ctaMainLabel">{loading ? "Conectando..." : "Continuar com Google"}</span>
        </button>

        <p className="loginSupportText">Acesso rápido e seguro. Em poucos segundos sua carteira estará sincronizada.</p>
        {error ? <p className="errorBox loginError">{error}</p> : null}

        <div className="loginLegalLinks">
          <Link
            href="/terms"
            onClick={() => {
              trackEvent("login_terms_click", { source: "login_page" });
            }}
          >
            Termos
          </Link>
          <span aria-hidden>•</span>
          <Link
            href="/privacy"
            onClick={() => {
              trackEvent("login_privacy_click", { source: "login_page" });
            }}
          >
            Privacidade
          </Link>
        </div>
      </section>
    </main>
  );
}
