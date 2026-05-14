import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

export async function POST(_request: Request, { params }: { params: { showId: string; postId: string } }) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = params;

  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  } else {
    await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  }

  const { data: post } = await supabase.from("show_posts").select("like_count").eq("id", postId).single();

  return NextResponse.json({ liked: !existing, likeCount: (post as { like_count: number } | null)?.like_count ?? 0 });
}
