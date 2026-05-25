import { NextResponse } from "next/server";
import { extractViewerProfile } from "@/lib/auth";
import {
  configErrorResponse,
  ensureCurrentProfile,
  fetchProfileCounts,
  loadAuthContext,
  unauthorizedResponse
} from "@/lib/supabase/social-helpers";

export async function GET() {
  const { supabase, userId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();
  if (!userId) return unauthorizedResponse();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const fallbackProfile = user
    ? extractViewerProfile(user)
    : { id: userId, name: "Fã de shows", email: "", avatarUrl: null };

  const profile = await ensureCurrentProfile(supabase, userId, {
    displayName: fallbackProfile.name,
    avatarUrl: fallbackProfile.avatarUrl
  });

  const counts = await fetchProfileCounts(supabase, userId);

  return NextResponse.json({
    profile: {
      userId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      followingCount: counts.followingCount,
      followerCount: counts.followerCount,
      isViewerFollowing: false,
      isSelf: true
    }
  });
}
