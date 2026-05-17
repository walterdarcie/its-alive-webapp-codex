import { NextResponse } from "next/server";
import type { ShowRecord } from "@/lib/show-types";
import type { PublicWalletEntry } from "@/lib/social-types";
import { configErrorResponse, loadAuthContext } from "@/lib/supabase/social-helpers";

export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const targetId = params.userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { supabase, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const { data, error } = await supabase
    .from("wallet_entries")
    .select("setlist_id, event_date, status, show_data, updated_at")
    .eq("user_id", targetId)
    .order("event_date", { ascending: false });

  if (error) {
    console.error("[profiles/wallet] error:", error.message);
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
  }

  const items: PublicWalletEntry[] = (data ?? []).map((row) => ({
    show: row.show_data as ShowRecord,
    action: row.status === "went" ? "went" : "going",
    savedAtIso: row.updated_at as string
  }));

  return NextResponse.json({ items });
}
