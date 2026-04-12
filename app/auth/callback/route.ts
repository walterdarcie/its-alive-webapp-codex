import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const safeNext = /^\/(?!\/)/.test(next) ? next : "/";

  if (code) {
    if (!hasSupabaseEnv()) {
      return NextResponse.redirect(new URL("/signin?error=supabase_not_configured", requestUrl.origin));
    }

    try {
      const supabase = createSupabaseServerClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      return NextResponse.redirect(new URL("/signin?error=oauth_callback_failed", requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
}
