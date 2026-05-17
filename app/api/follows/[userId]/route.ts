import { NextResponse } from "next/server";
import {
  configErrorResponse,
  fetchProfileCounts,
  loadAuthContext,
  unauthorizedResponse
} from "@/lib/supabase/social-helpers";

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const targetId = params.userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { supabase, userId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();
  if (!userId) return unauthorizedResponse();
  if (userId === targetId) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_follows")
    .upsert({ follower_id: userId, following_id: targetId }, { onConflict: "follower_id,following_id" });

  if (error) {
    console.error("[follows POST] Supabase error:", error.message);
    return NextResponse.json({ error: "Failed to follow user" }, { status: 500 });
  }

  const counts = await fetchProfileCounts(supabase, targetId);

  return NextResponse.json({
    following: true,
    targetUserId: targetId,
    followerCount: counts.followerCount
  });
}

export async function DELETE(_request: Request, { params }: { params: { userId: string } }) {
  const targetId = params.userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { supabase, userId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();
  if (!userId) return unauthorizedResponse();

  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", userId)
    .eq("following_id", targetId);

  if (error) {
    console.error("[follows DELETE] Supabase error:", error.message);
    return NextResponse.json({ error: "Failed to unfollow user" }, { status: 500 });
  }

  const counts = await fetchProfileCounts(supabase, targetId);

  return NextResponse.json({
    following: false,
    targetUserId: targetId,
    followerCount: counts.followerCount
  });
}
