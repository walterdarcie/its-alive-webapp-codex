import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";
import type { UserProfileSummary } from "@/lib/social-types";

type AuthContext = {
  supabase: SupabaseClient | null;
  userId: string | null;
  configError: boolean;
};

export async function loadAuthContext(): Promise<AuthContext> {
  if (!hasSupabaseEnv()) {
    return { supabase: null, userId: null, configError: true };
  }

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return { supabase, userId: user?.id ?? null, configError: false };
  } catch {
    return { supabase: null, userId: null, configError: true };
  }
}

export function configErrorResponse() {
  return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function fetchProfileSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfileSummary | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[social] fetchProfileSummary error:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    userId: data.user_id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url ?? null
  };
}

export async function fetchProfileCounts(
  supabase: SupabaseClient,
  userId: string
): Promise<{ followingCount: number; followerCount: number }> {
  const [followingResult, followerResult] = await Promise.all([
    supabase
      .from("user_follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase
      .from("user_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", userId)
  ]);

  return {
    followingCount: followingResult.count ?? 0,
    followerCount: followerResult.count ?? 0
  };
}

export async function isViewerFollowing(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<boolean> {
  if (viewerId === targetId) return false;

  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .eq("following_id", targetId)
    .maybeSingle();

  if (error) {
    console.error("[social] isViewerFollowing error:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function ensureCurrentProfile(
  supabase: SupabaseClient,
  userId: string,
  fallback: { displayName: string; avatarUrl: string | null }
): Promise<UserProfileSummary> {
  const existing = await fetchProfileSummary(supabase, userId);
  if (existing) return existing;

  const { error } = await supabase.from("profiles").insert({
    user_id: userId,
    display_name: fallback.displayName,
    display_name_normalized: fallback.displayName
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase(),
    avatar_url: fallback.avatarUrl
  });

  if (error) {
    console.error("[social] ensureCurrentProfile insert error:", error.message);
  }

  return {
    userId,
    displayName: fallback.displayName,
    avatarUrl: fallback.avatarUrl
  };
}
