import { NextResponse } from "next/server";
import type { UserProfileSummary } from "@/lib/social-types";
import { configErrorResponse, loadAuthContext } from "@/lib/supabase/social-helpers";

const FOLLOWS_LIMIT = 200;
const VALID_TYPES = new Set(["following", "followers"]);

export type FollowRelationType = "following" | "followers";

export type FollowsListItem = UserProfileSummary & {
  isViewerFollowing: boolean;
  isSelf: boolean;
};

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const targetId = params.userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const url = new URL(request.url);
  const requestedType = (url.searchParams.get("type") ?? "following").trim();
  if (!VALID_TYPES.has(requestedType)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const type = requestedType as FollowRelationType;

  const { supabase, userId: viewerId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const selectColumn = type === "following" ? "following_id" : "follower_id";
  const filterColumn = type === "following" ? "follower_id" : "following_id";

  const { data: edges, error: edgesError } = await supabase
    .from("user_follows")
    .select(`${selectColumn}, created_at`)
    .eq(filterColumn, targetId)
    .order("created_at", { ascending: false })
    .limit(FOLLOWS_LIMIT);

  if (edgesError) {
    console.error("[profiles/follows] edges error:", edgesError.message);
    return NextResponse.json({ error: "Failed to load follows" }, { status: 500 });
  }

  const ids = (edges ?? [])
    .map((row) => row[selectColumn as keyof typeof row] as string)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (!ids.length) {
    return NextResponse.json({ items: [], type });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", ids);

  if (profilesError) {
    console.error("[profiles/follows] profiles error:", profilesError.message);
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }

  const profileMap = new Map<string, { displayName: string; avatarUrl: string | null }>(
    (profiles ?? []).map((row) => [
      row.user_id as string,
      {
        displayName: (row.display_name as string) ?? "Alguém",
        avatarUrl: (row.avatar_url as string | null) ?? null
      }
    ])
  );

  let viewerFollowingIds = new Set<string>();
  if (viewerId && ids.length) {
    const { data: viewerFollows } = await supabase
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in("following_id", ids);
    viewerFollowingIds = new Set(
      (viewerFollows ?? []).map((row) => row.following_id as string)
    );
  }

  // Preserve original ordering (most-recent edge first).
  const items: FollowsListItem[] = ids
    .map((id) => {
      const summary = profileMap.get(id);
      if (!summary) return null;
      return {
        userId: id,
        displayName: summary.displayName,
        avatarUrl: summary.avatarUrl,
        isViewerFollowing: viewerFollowingIds.has(id),
        isSelf: viewerId === id
      } satisfies FollowsListItem;
    })
    .filter((item): item is FollowsListItem => item !== null);

  return NextResponse.json({ items, type });
}
