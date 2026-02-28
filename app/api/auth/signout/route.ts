import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

export async function POST(request: Request) {
  if (hasSupabaseEnv()) {
    try {
      const supabase = createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Keep signout endpoint resilient even when supabase env is missing/misconfigured.
    }
  }

  const requestUrl = new URL(request.url);
  return NextResponse.json({ ok: true, redirectTo: `${requestUrl.origin}/login` });
}
