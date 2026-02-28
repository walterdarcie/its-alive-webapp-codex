import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

function isAuthBypassEnabled() {
  return process.env.BYPASS_AUTH === "1" || process.env.NEXT_PUBLIC_BYPASS_AUTH === "1";
}

function buildBypassUser(): User {
  return {
    id: "bypass-user",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: { name: "QA User" },
    created_at: new Date(0).toISOString()
  } as User;
}

export async function getServerUser() {
  if (isAuthBypassEnabled()) {
    return buildBypassUser();
  }

  if (!hasSupabaseEnv()) {
    return null;
  }

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function requireServerUser() {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
