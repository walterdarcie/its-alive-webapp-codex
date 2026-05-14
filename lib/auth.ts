import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

function isAuthBypassEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.BYPASS_AUTH === "1";
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

export type ViewerProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function extractViewerProfile(user: User): ViewerProfile {
  const metadata = user.user_metadata ?? {};
  const rawName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof user.email === "string" && user.email.split("@")[0]) ||
    "Fã de shows";

  const avatarUrl =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()) ||
    (typeof metadata.picture === "string" && metadata.picture.trim()) ||
    null;

  return {
    id: user.id,
    name: rawName,
    email: user.email ?? "",
    avatarUrl
  };
}
