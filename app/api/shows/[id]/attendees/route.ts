import { NextResponse } from "next/server";
import { configErrorResponse, loadAuthContext } from "@/lib/supabase/social-helpers";

const RECENT_LIMIT = 4;
const SCAN_LIMIT = 200;

export type AttendeesPayload = {
  total: number;
  status: "going" | "went" | "mixed";
  recent: Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
};

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const setlistId = params.id?.trim();
  if (!setlistId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { supabase, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const { data, error, count } = await supabase
    .from("wallet_entries")
    .select("user_id, status, updated_at", { count: "exact" })
    .eq("setlist_id", setlistId)
    .order("updated_at", { ascending: false })
    .limit(SCAN_LIMIT);

  if (error) {
    console.error("[shows/attendees] wallet error:", error.message);
    return NextResponse.json({ error: "Failed to load attendees" }, { status: 500 });
  }

  const rows = data ?? [];
  const total = count ?? rows.length;
  const statuses = new Set<string>();
  for (const row of rows) statuses.add(row.status as string);
  const status: AttendeesPayload["status"] =
    statuses.size === 1 ? ((rows[0]?.status as "going" | "went") ?? "going") : "mixed";

  const recentIds: string[] = [];
  for (const row of rows) {
    const userId = row.user_id as string;
    if (!userId || recentIds.includes(userId)) continue;
    recentIds.push(userId);
    if (recentIds.length >= RECENT_LIMIT) break;
  }

  let recent: AttendeesPayload["recent"] = [];
  if (recentIds.length) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", recentIds);

    if (profilesError) {
      console.error("[shows/attendees] profiles error:", profilesError.message);
    } else {
      const map = new Map<string, { displayName: string; avatarUrl: string | null }>();
      for (const profile of profilesData ?? []) {
        map.set(profile.user_id as string, {
          displayName: (profile.display_name as string) ?? "",
          avatarUrl: (profile.avatar_url as string | null) ?? null
        });
      }
      recent = recentIds
        .map((userId) => {
          const profile = map.get(userId);
          if (!profile) return null;
          return {
            userId,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl
          };
        })
        .filter((entry): entry is AttendeesPayload["recent"][number] => Boolean(entry));
    }
  }

  const payload: AttendeesPayload = {
    total,
    status,
    recent
  };

  return NextResponse.json(payload);
}
