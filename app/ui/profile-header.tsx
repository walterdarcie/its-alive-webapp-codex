"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { formatPtBrNumber, type UserProfileWithCounts } from "@/lib/social-types";
import { useLocale } from "@/lib/i18n-context";
import { trackEvent } from "@/lib/analytics";

type ProfileHeaderProps = {
  profile: UserProfileWithCounts | null;
  fallbackName: string;
  fallbackAvatarUrl: string | null;
  showsThisYear: number;
  showsTotal: number;
  primaryAction?: ReactNode;
};

function buildAvatarStyle(avatarUrl: string): CSSProperties {
  const sanitized = avatarUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return {
    backgroundImage: `url("${sanitized}")`
  };
}

function formatShowCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function ProfileHeader({
  profile,
  fallbackName,
  fallbackAvatarUrl,
  showsThisYear,
  showsTotal,
  primaryAction
}: ProfileHeaderProps) {
  const { t } = useLocale();
  const displayName = profile?.displayName ?? fallbackName;
  const avatarUrl = profile?.avatarUrl ?? fallbackAvatarUrl;
  const followingCount = profile?.followingCount ?? 0;
  const followerCount = profile?.followerCount ?? 0;
  const userId = profile?.userId ?? null;
  const followingHref = userId ? `/u/${encodeURIComponent(userId)}/seguindo` : "#";
  const followersHref = userId ? `/u/${encodeURIComponent(userId)}/seguidores` : "#";
  const currentYear = new Date().getFullYear();

  return (
    <section className="profileBlock" aria-label={t.profile.profileAriaLabel(displayName)}>
      <div className="profileAvatarWrap">
        {avatarUrl ? (
          <span className="profileAvatar profileAvatarPhoto" style={buildAvatarStyle(avatarUrl)} aria-hidden />
        ) : (
          <span className="profileAvatar profileAvatarFallback" aria-hidden />
        )}
      </div>
      <div className="profileIdentity">
        <h1 className="profileName">{displayName}</h1>

        <div className="profileShowStats" aria-label={t.profile.showsAriaLabel}>
          <div className="profileShowStat">
            <span className="profileShowStatNumber">{formatShowCount(showsThisYear)}</span>
            <span className="profileShowStatLabelGroup">
              <span className="profileShowStatLabelTop">{t.profile.showsLabel}</span>
              <span className="profileShowStatLabel">{t.profile.thisYear(currentYear)}</span>
            </span>
          </div>
          <span className="profileShowStatDivider" aria-hidden />
          <div className="profileShowStat">
            <span className="profileShowStatNumber">{formatShowCount(showsTotal)}</span>
            <span className="profileShowStatLabelGroup">
              <span className="profileShowStatLabelTop">{t.profile.showsLabel}</span>
              <span className="profileShowStatLabel">{t.profile.total}</span>
            </span>
          </div>
        </div>

        <div className="profileStats profileStatsSecondary">
          <Link
            href={followingHref}
            className="profileStat profileStatLink"
            aria-label={t.profile.followingAriaLabel(displayName)}
            onClick={(event) => {
              if (!userId) {
                event.preventDefault();
                return;
              }
              trackEvent("profile_stat_click", { stat: "following" });
            }}
          >
            <span className="profileStatNumber">{formatPtBrNumber(followingCount)}</span>
            <span className="profileStatLabel">{t.profile.following}</span>
          </Link>
          <Link
            href={followersHref}
            className="profileStat profileStatLink"
            aria-label={t.profile.followersAriaLabel(displayName)}
            onClick={(event) => {
              if (!userId) {
                event.preventDefault();
                return;
              }
              trackEvent("profile_stat_click", { stat: "followers" });
            }}
          >
            <span className="profileStatNumber">{formatPtBrNumber(followerCount)}</span>
            <span className="profileStatLabel">{t.profile.followers}</span>
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
  const { t } = useLocale();
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
      if (!response.ok) throw new Error(t.profile.followError);
      const payload = (await response.json()) as { following: boolean; followerCount: number };
      setFollowing(payload.following);
      onChange?.(payload.following, payload.followerCount);
      trackEvent(nextFollowing ? "follow_user" : "unfollow_user", { source, target_user_id: targetUserId });
    } catch (err) {
      setFollowing(!nextFollowing);
      setError(err instanceof Error ? err.message : t.profile.updateError);
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
      aria-label={following ? t.profile.unfollowAriaLabel : t.profile.followAriaLabel}
      title={error ?? undefined}
    >
      <span className="ctaMainLabel">{following ? t.profile.followingBtn : t.profile.followBtn}</span>
    </button>
  );
}
