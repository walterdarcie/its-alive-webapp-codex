import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getServerUser } from "@/lib/auth";
import { FollowListClient, type FollowListItem } from "@/app/ui/follow-list-client";
import type { UserProfileWithCounts } from "@/lib/social-types";

type Params = { userId: string };

function originFromHeaders() {
  try {
    const host = headers().get("host");
    const protocol = headers().get("x-forwarded-proto") ?? "https";
    if (!host) return "";
    return `${protocol}://${host}`;
  } catch {
    return "";
  }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const base = originFromHeaders();
    if (!base) return null;
    const cookie = headers().get("cookie") ?? "";
    const response = await fetch(`${base}${path}`, {
      headers: { cookie },
      cache: "no-store"
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await fetchJson<{ profile: UserProfileWithCounts }>(
    `/api/profiles/${encodeURIComponent(params.userId)}`
  );
  const name = data?.profile.displayName ?? "Perfil";
  return {
    title: `Seguindo — ${name}`,
    description: `Pessoas que ${name} segue no it's alive.`
  };
}

export default async function ProfileFollowingPage({ params }: { params: Params }) {
  const user = await getServerUser();

  const [profilePayload, followsPayload] = await Promise.all([
    fetchJson<{ profile: UserProfileWithCounts }>(
      `/api/profiles/${encodeURIComponent(params.userId)}`
    ),
    fetchJson<{ items: FollowListItem[] }>(
      `/api/profiles/${encodeURIComponent(params.userId)}/follows?type=following`
    )
  ]);

  if (!profilePayload?.profile) {
    notFound();
  }

  const owner = profilePayload.profile;
  const ownerIsViewer = user?.id === owner.userId;

  return (
    <FollowListClient
      ownerUserId={owner.userId}
      ownerDisplayName={owner.displayName}
      ownerIsViewer={ownerIsViewer}
      type="following"
      items={followsPayload?.items ?? []}
      isAuthenticated={!!user}
    />
  );
}
