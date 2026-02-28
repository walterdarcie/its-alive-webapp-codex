import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  const requestUrl = new URL(request.url);
  return NextResponse.json({ ok: true, redirectTo: `${requestUrl.origin}/login` });
}
