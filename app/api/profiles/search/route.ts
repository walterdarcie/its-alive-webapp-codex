import { NextResponse } from "next/server";
import { normalizeNameForSearch } from "@/lib/social-utils";
import { configErrorResponse, loadAuthContext } from "@/lib/supabase/social-helpers";

const RESULT_LIMIT = 20;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const normalized = normalizeNameForSearch(rawQuery);

  if (normalized.length < 2) {
    return NextResponse.json({ profiles: [] });
  }

  const { supabase, userId: viewerId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const escaped = normalized.replace(/[%_]/g, (char) => `\\${char}`);
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url, display_name_normalized")
    .ilike("display_name_normalized", `%${escaped}%`)
    .limit(RESULT_LIMIT);

  if (error) {
    console.error("[profiles search] Supabase error:", error.message);
    return NextResponse.json({ error: "Failed to search profiles" }, { status: 500 });
  }

  const filtered = (data ?? []).filter((row) => row.user_id !== viewerId);
  let isFollowingMap = new Map<string, boolean>();
  if (viewerId && filtered.length) {
    const ids = filtered.map((row) => row.user_id);
    const { data: follows, error: followsError } = await supabase
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in("following_id", ids);

    if (!followsError && follows) {
      isFollowingMap = new Map(follows.map((row) => [row.following_id as string, true]));
    }
  }

  const profiles = filtered.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    isViewerFollowing: isFollowingMap.get(row.user_id) ?? false
  }));

  return NextResponse.json({ profiles });
}
