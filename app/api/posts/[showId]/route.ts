import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";
import { extractViewerProfile } from "@/lib/auth";

type PostRow = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_avatar_url: string | null;
  body: string;
  photo_url: string | null;
  like_count: number;
  created_at: string;
};

type PostLikeRow = { post_id: string };

function mapPost(row: PostRow, likedIds: Set<string>) {
  return {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.user_display_name,
    userAvatarUrl: row.user_avatar_url,
    body: row.body,
    photoUrl: row.photo_url,
    likeCount: row.like_count,
    viewerLiked: likedIds.has(row.id),
    createdAt: row.created_at
  };
}

export async function GET(_request: Request, { params }: { params: { showId: string } }) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const showId = decodeURIComponent(params.showId);

  const [{ data: { user } }, { data: posts, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("show_posts")
      .select("id, user_id, user_display_name, user_avatar_url, body, photo_url, like_count, created_at")
      .eq("show_id", showId)
      .order("created_at", { ascending: false })
      .limit(50)
  ]);

  if (error) {
    return NextResponse.json({ error: "Failed to load posts", message: error.message }, { status: 500 });
  }

  const rows = (posts ?? []) as PostRow[];
  let likedIds = new Set<string>();

  if (user && rows.length > 0) {
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id")
      .in("post_id", rows.map((r) => r.id))
      .eq("user_id", user.id);
    likedIds = new Set((likes ?? []).map((l: PostLikeRow) => l.post_id));
  }

  return NextResponse.json({ posts: rows.map((r) => mapPost(r, likedIds)) });
}

export async function POST(request: Request, { params }: { params: { showId: string } }) {
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

  const showId = decodeURIComponent(params.showId);
  const body = (await request.json()) as { body?: string; photoUrl?: string };

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  if (body.body.trim().length > 1000) {
    return NextResponse.json({ error: "Body too long" }, { status: 400 });
  }

  const { name, avatarUrl } = extractViewerProfile(user);

  const { data: post, error } = await supabase
    .from("show_posts")
    .insert({
      user_id: user.id,
      user_display_name: name,
      user_avatar_url: avatarUrl,
      show_id: showId,
      body: body.body.trim(),
      photo_url: body.photoUrl ?? null
    })
    .select("id, user_id, user_display_name, user_avatar_url, body, photo_url, like_count, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create post", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: mapPost(post as PostRow, new Set()) }, { status: 201 });
}
