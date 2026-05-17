"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { formatPtBrNumber, type UserProfileWithCounts } from "@/lib/social-types";
import { trackEvent } from "@/lib/analytics";

type ProfileHeaderProps = {
  profile: UserProfileWithCounts | null;
  fallbackName: string;
  fallbackAvatarUrl: string | null;
  primaryAction?: ReactNode;
};

function buildAvatarStyle(avatarUrl: string): CSSProperties {
  const sanitized = avatarUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return {
    backgroundImage: `url("${sanitized}")`
  };
}

export function ProfileHeader({ profile, fallbackName, fallbackAvatarUrl, primaryAction }: ProfileHeaderProps) {
  const displayName = profile?.displayName ?? fallbackName;
  const avatarUrl = profile?.avatarUrl ?? fallbackAvatarUrl;
  const followingCount = profile?.followingCount ?? 0;
  const followerCount = profile?.followerCount ?? 0;

  return (
    <section className="profileBlock" aria-label={`Perfil de ${displayName}`}>
      <div className="profileAvatarWrap">
        {avatarUrl ? (
          <span className="profileAvatar profileAvatarPhoto" style={buildAvatarStyle(avatarUrl)} aria-hidden />
        ) : (
          <span className="profileAvatar profileAvatarFallback" aria-hidden />
        )}
      </div>
      <div className="profileIdentity">
        <h1 className="profileName">{displayName}</h1>
        <div className="profileStats">
          <Link
            href={profile?.isSelf === false ? "#" : "/?tab=following-list"}
            className="profileStat profileStatLink"
            aria-label={`${followingCount} pessoas que ${displayName} segue`}
            onClick={(event) => {
              if (profile?.isSelf === false) event.preventDefault();
              trackEvent("profile_stat_click", { stat: "following" });
            }}
          >
            <span className="profileStatNumber">{formatPtBrNumber(followingCount)}</span>
            <span className="profileStatLabel">Seguindo</span>
          </Link>
          <Link
            href={profile?.isSelf === false ? "#" : "/?tab=followers-list"}
            className="profileStat profileStatLink"
            aria-label={`${followerCount} seguidores de ${displayName}`}
            onClick={(event) => {
              if (profile?.isSelf === false) event.preventDefault();
              trackEvent("profile_stat_click", { stat: "followers" });
            }}
          >
            <span className="profileStatNumber">{formatPtBrNumber(followerCount)}</span>
            <span className="profileStatLabel">Seguidores</span>
          </Link>
        </div>
        {primaryAction ? <div className="profileAction">{primaryAction}</div> : null}
      </div>
    </section>
  );
}

type FollowButtonProps = {
  targetUserId: string;
  initialFollowing: boolean;
  onChange?: (following: boolean, followerCount: number) => void;
  source: string;
};

export function FollowButton({ targetUserId, initialFollowing, onChange, source }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    const nextFollowing = !following;
    setFollowing(nextFollowing);

    try {
      const response = await fetch(`/api/follows/${encodeURIComponent(targetUserId)}`, {
        method: nextFollowing ? "POST" : "DELETE"
      });
      if (!response.ok) throw new Error("Falha ao atualizar.");
      const payload = (await response.json()) as { following: boolean; followerCount: number };
      setFollowing(payload.following);
      onChange?.(payload.following, payload.followerCount);
      trackEvent(nextFollowing ? "follow_user" : "unfollow_user", { source, target_user_id: targetUserId });
    } catch (err) {
      setFollowing(!nextFollowing);
      setError(err instanceof Error ? err.message : "Não conseguimos atualizar agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={`ctaMain followBtn${following ? " isFollowing" : ""}`}
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? "Deixar de seguir" : "Seguir"}
      title={error ?? undefined}
    >
      <span className="ctaMainLabel">{following ? "Seguindo" : "Seguir"}</span>
    </button>
  );
}
