import { NextResponse } from "next/server";
import type { FollowFeedItem } from "@/lib/social-types";
import type { ShowRecord } from "@/lib/show-types";
import { isFutureOrTodayShow } from "@/lib/show-utils";
import {
  configErrorResponse,
  loadAuthContext,
  unauthorizedResponse
} from "@/lib/supabase/social-helpers";

const FEED_LIMIT = 30;
// Puxamos mais entries do que mostramos pra reordenar por data do show sem
// cortar candidatos relevantes — o "limit do SQL" usa updated_at, mas a UI
// ordena por eventDateIso.
const FEED_FETCH_LIMIT = 200;

export async function GET() {
  const { supabase, userId, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();
  if (!userId) return unauthorizedResponse();

  const { data: follows, error: followsError } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (followsError) {
    console.error("[feed/following] follows error:", followsError.message);
    return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
  }

  const followedIds = (follows ?? []).map((row) => row.following_id as string);
  if (!followedIds.length) {
    return NextResponse.json({ items: [] });
  }

  const { data: entries, error: entriesError } = await supabase
    .from("wallet_entries")
    .select("user_id, setlist_id, status, show_data, updated_at")
    .in("user_id", followedIds)
    .order("updated_at", { ascending: false })
    .limit(FEED_FETCH_LIMIT);

  if (entriesError) {
    console.error("[feed/following] entries error:", entriesError.message);
    return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
  }

  const actorIds = Array.from(new Set((entries ?? []).map((row) => row.user_id as string)));
  let actorMap = new Map<string, { displayName: string; avatarUrl: string | null }>();

  if (actorIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", actorIds);

    if (profilesError) {
      console.error("[feed/following] profiles error:", profilesError.message);
    } else {
      actorMap = new Map(
        (profiles ?? []).map((row) => [
          row.user_id as string,
          {
            displayName: (row.display_name as string) ?? "Alguém",
            avatarUrl: (row.avatar_url as string | null) ?? null
          }
        ])
      );
    }
  }

  const mapped: FollowFeedItem[] = (entries ?? []).map((row) => {
    const actor = actorMap.get(row.user_id as string) ?? { displayName: "Alguém", avatarUrl: null };
    const show = row.show_data as ShowRecord;
    // O status armazenado é "congelado" no momento do save; aqui derivamos
    // novamente pela data do show para que shows antigos virem "Foi"
    // automaticamente no feed conforme o tempo passa.
    const action = isFutureOrTodayShow(show.eventDateIso) ? "going" : "went";
    return {
      id: `${row.user_id}:${row.setlist_id}`,
      actor: {
        userId: row.user_id as string,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl
      },
      action,
      occurredAtIso: row.updated_at as string,
      show
    };
  });

  // Ordem cronológica: shows futuros primeiro (mais próximo de hoje no topo),
  // depois passados em ordem decrescente. A data do show é a referência
  // temporal visível no card — ordenar por ela mantém o feed previsível.
  const items = mapped
    .sort((a, b) => {
      if (a.action === "going" && b.action === "went") return -1;
      if (a.action === "went" && b.action === "going") return 1;
      if (a.action === "going") return a.show.eventDateIso.localeCompare(b.show.eventDateIso);
      return b.show.eventDateIso.localeCompare(a.show.eventDateIso);
    })
    .slice(0, FEED_LIMIT);

  return NextResponse.json({ items });
}
