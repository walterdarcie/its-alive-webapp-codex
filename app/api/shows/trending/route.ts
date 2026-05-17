import { NextResponse } from "next/server";
import type { ShowRecord } from "@/lib/show-types";
import type { TrendingShow } from "@/lib/social-types";
import { configErrorResponse, loadAuthContext } from "@/lib/supabase/social-helpers";

const TRENDING_LIMIT = 12;
const SCAN_LIMIT = 200;

export async function GET() {
  const { supabase, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("wallet_entries")
    .select("setlist_id, event_date, show_data, status")
    .eq("status", "going")
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(SCAN_LIMIT);

  if (error) {
    console.error("[shows/trending] error:", error.message);
    return NextResponse.json({ error: "Failed to load trending shows" }, { status: 500 });
  }

  const buckets = new Map<string, { count: number; show: ShowRecord; eventDate: string }>();
  for (const row of data ?? []) {
    const showRecord = row.show_data as ShowRecord;
    const setlistId = row.setlist_id as string;
    if (!showRecord || !setlistId) continue;
    const existing = buckets.get(setlistId);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(setlistId, {
        count: 1,
        show: showRecord,
        eventDate: row.event_date as string
      });
    }
  }

  const trending: TrendingShow[] = Array.from(buckets.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.eventDate.localeCompare(b.eventDate);
    })
    .slice(0, TRENDING_LIMIT)
    .map(({ count, show }) => ({ show, attendingCount: count }));

  return NextResponse.json({ shows: trending });
}
