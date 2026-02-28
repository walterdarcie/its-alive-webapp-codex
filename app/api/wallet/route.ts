import { NextResponse } from "next/server";
import type { ShowRecord } from "@/lib/show-types";
import { deriveWalletStatus } from "@/lib/show-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/shared";

type WalletRow = {
  setlist_id: string;
  event_date: string;
  status: "going" | "went";
  show_data: ShowRecord;
  updated_at: string;
};

type WalletPayload = {
  items: Array<{
    show: ShowRecord;
    savedAt: string;
  }>;
};

async function requireUserId() {
  if (!hasSupabaseEnv()) {
    return { supabase: null, userId: null, configError: true };
  }

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return { supabase, userId: user?.id ?? null, configError: false };
  } catch {
    return { supabase: null, userId: null, configError: true };
  }
}

function normalizeWalletPayload(rows: WalletRow[]): WalletPayload {
  return {
    items: rows.map((row) => ({
      show: row.show_data,
      savedAt: row.updated_at
    }))
  };
}

export async function GET() {
  const { supabase, userId, configError } = await requireUserId();
  if (configError || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wallet_entries")
    .select("setlist_id, event_date, status, show_data, updated_at")
    .eq("user_id", userId)
    .order("event_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load wallet", message: error.message }, { status: 500 });
  }

  return NextResponse.json(normalizeWalletPayload((data ?? []) as WalletRow[]));
}

export async function POST(request: Request) {
  const { supabase, userId, configError } = await requireUserId();
  if (configError || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { show?: ShowRecord };
  const show = body.show;

  if (!show?.id || !show.eventDateIso) {
    return NextResponse.json({ error: "Invalid show payload" }, { status: 400 });
  }

  const status = deriveWalletStatus(show.eventDateIso);

  const { error } = await supabase.from("wallet_entries").upsert(
    {
      user_id: userId,
      setlist_id: show.id,
      event_date: show.eventDateIso,
      status,
      show_data: show
    },
    {
      onConflict: "user_id,setlist_id"
    }
  );

  if (error) {
    return NextResponse.json({ error: "Failed to save wallet item", message: error.message }, { status: 500 });
  }

  const { data, error: fetchError } = await supabase
    .from("wallet_entries")
    .select("setlist_id, event_date, status, show_data, updated_at")
    .eq("user_id", userId)
    .order("event_date", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ error: "Saved, but failed to refresh wallet", message: fetchError.message }, { status: 500 });
  }

  return NextResponse.json(normalizeWalletPayload((data ?? []) as WalletRow[]));
}

export async function DELETE(request: Request) {
  const { supabase, userId, configError } = await requireUserId();
  if (configError || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const showId = requestUrl.searchParams.get("showId")?.trim();
  if (!showId) {
    return NextResponse.json({ error: "Missing showId" }, { status: 400 });
  }

  const { error } = await supabase.from("wallet_entries").delete().eq("user_id", userId).eq("setlist_id", showId);
  if (error) {
    return NextResponse.json({ error: "Failed to remove wallet item", message: error.message }, { status: 500 });
  }

  const { data, error: fetchError } = await supabase
    .from("wallet_entries")
    .select("setlist_id, event_date, status, show_data, updated_at")
    .eq("user_id", userId)
    .order("event_date", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ error: "Removed, but failed to refresh wallet", message: fetchError.message }, { status: 500 });
  }

  return NextResponse.json(normalizeWalletPayload((data ?? []) as WalletRow[]));
}
