import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

export async function DELETE(_request: Request, { params }: { params: { showId: string; postId: string } }) {
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

  const { error } = await supabase
    .from("show_posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete post", message: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
