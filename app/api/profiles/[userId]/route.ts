import { NextResponse } from "next/server";
import {
  configErrorResponse,
  fetchProfileCounts,
  fetchProfileSummary,
  isViewerFollowing,
  loadAuthContext
} from "@/lib/supabase/social-helpers";

export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const targetId = params.userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { supabase, userId: viewerId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const profile = await fetchProfileSummary(supabase, targetId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const counts = await fetchProfileCounts(supabase, targetId);
  const following = viewerId ? await isViewerFollowing(supabase, viewerId, targetId) : false;

  return NextResponse.json({
    profile: {
      userId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      followingCount: counts.followingCount,
      followerCount: counts.followerCount,
      isViewerFollowing: following,
      isSelf: viewerId === targetId
    }
  });
}
