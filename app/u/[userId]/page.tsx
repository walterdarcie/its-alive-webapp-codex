import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { extractViewerProfile, getServerUser } from "@/lib/auth";
import { ProfileUserClient } from "@/app/ui/profile-user-client";
import type { PublicWalletEntry, UserProfileWithCounts } from "@/lib/social-types";

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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const base = originFromHeaders();
    if (!base) return null;
    const cookie = headers().get("cookie") ?? "";
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        cookie
      },
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
    title: `${name} no it's alive`,
    description: `Shows que ${name} foi e vai. Encontre amigos com as mesmas memórias ao vivo.`
  };
}

export default async function UserProfilePage({ params }: { params: Params }) {
  const user = await getServerUser();
  const viewer = user ? extractViewerProfile(user) : null;

  const [profilePayload, walletPayload] = await Promise.all([
    fetchJson<{ profile: UserProfileWithCounts }>(
      `/api/profiles/${encodeURIComponent(params.userId)}`
    ),
    fetchJson<{ items: PublicWalletEntry[] }>(
      `/api/profiles/${encodeURIComponent(params.userId)}/wallet`
    )
  ]);

  if (!profilePayload?.profile) {
    notFound();
  }

  return (
    <ProfileUserClient
      profile={profilePayload.profile}
      wallet={walletPayload?.items ?? []}
      viewer={viewer}
      isAuthenticated={!!user}
    />
  );
}
