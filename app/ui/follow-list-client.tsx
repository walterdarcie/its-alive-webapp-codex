"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { FollowButton } from "@/app/ui/profile-header";
import { SocialDrawer } from "@/app/ui/social-drawer";
import { trackEvent } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n-context";

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="iconSvg">
      <path d="M4 7h16 M4 12h16 M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="iconSvg">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function buildAvatarStyle(url: string): CSSProperties {
  const sanitized = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return { backgroundImage: `url("${sanitized}")` };
}

export type FollowListItem = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isViewerFollowing: boolean;
  isSelf: boolean;
};

type FollowListClientProps = {
  ownerUserId: string;
  ownerDisplayName: string;
  ownerIsViewer: boolean;
  type: "following" | "followers";
  items: FollowListItem[];
  isAuthenticated: boolean;
};

export function FollowListClient({
  ownerUserId,
  ownerDisplayName,
  ownerIsViewer,
  type,
  items: initialItems,
  isAuthenticated
}: FollowListClientProps) {
  const { t } = useLocale();
  const [items, setItems] = useState(initialItems);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const followingHref = `/u/${encodeURIComponent(ownerUserId)}/seguindo`;
  const followersHref = `/u/${encodeURIComponent(ownerUserId)}/seguidores`;
  const backHref = ownerIsViewer ? "/" : `/u/${encodeURIComponent(ownerUserId)}`;
  const backLabel = ownerIsViewer ? t.followList.backToHome : t.followList.backToProfile(ownerDisplayName);
  const title = type === "following" ? t.followList.followingTitle : t.followList.followersTitle;
  const subtitle =
    type === "following"
      ? ownerIsViewer
        ? t.followList.followingSubSelf
        : t.followList.followingSubOther(ownerDisplayName)
      : ownerIsViewer
        ? t.followList.followersSubSelf
        : t.followList.followersSubOther(ownerDisplayName);

  function updateFollow(targetUserId: string, following: boolean) {
    setItems((current) =>
      current.map((item) => (item.userId === targetUserId ? { ...item, isViewerFollowing: following } : item))
    );
  }

  return (
    <main className="page pageSocial followListPage">
      <header className="topBarSocial">
        <Link href="/" aria-label={t.common.goHome} className="brandLogoLink">
          <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
        </Link>
        {isAuthenticated ? (
          <button
            type="button"
            className="hamburgerBtn iconBtn"
            aria-label={t.common.openMenu}
            onClick={() => {
              trackEvent("social_drawer_open", { source: "follow_list" });
              setDrawerOpen(true);
            }}
          >
            <HamburgerIcon />
          </button>
        ) : null}
      </header>

      <Link
        href={backHref}
        className="profilePageBack"
        onClick={() => trackEvent("follow_list_back_click", { type, owner_is_viewer: ownerIsViewer })}
      >
        <BackIcon />
        {backLabel}
      </Link>

      <div className="followListHeader">
        <h1 className="followListHeaderTitle">{title}</h1>
        <p className="followListHeaderSubtitle">{subtitle}</p>
      </div>

      <nav className="followListSwitch" aria-label={t.followList.switchLabel}>
        <Link
          href={followingHref}
          className={`followListSwitchItem ${type === "following" ? "isActive" : ""}`}
          aria-current={type === "following" ? "page" : undefined}
        >
          {t.followList.followingTitle}
        </Link>
        <Link
          href={followersHref}
          className={`followListSwitchItem ${type === "followers" ? "isActive" : ""}`}
          aria-current={type === "followers" ? "page" : undefined}
        >
          {t.followList.followersTitle}
        </Link>
      </nav>

      <div className="followListBody">
        {items.length ? (
          items.map((item) => (
            <div className="friendResultRow" key={item.userId}>
              <Link
                href={`/u/${encodeURIComponent(item.userId)}`}
                className="friendResultAvatarLink"
                aria-label={t.common.openProfileLabel(item.displayName)}
                onClick={() => trackEvent("follow_list_avatar_click", { type, target_user_id: item.userId })}
              >
                {item.avatarUrl ? (
                  <span
                    className="friendResultAvatar friendResultAvatarPhoto"
                    style={buildAvatarStyle(item.avatarUrl)}
                    aria-hidden
                  />
                ) : (
                  <span className="friendResultAvatar friendResultAvatarFallback" aria-hidden />
                )}
              </Link>
              <div className="friendResultIdentity">
                <h2 className="friendResultName">
                  <Link
                    href={`/u/${encodeURIComponent(item.userId)}`}
                    onClick={() => trackEvent("follow_list_name_click", { type, target_user_id: item.userId })}
                  >
                    {item.displayName}
                  </Link>
                </h2>
              </div>
              {item.isSelf ? null : isAuthenticated ? (
                <FollowButton
                  targetUserId={item.userId}
                  initialFollowing={item.isViewerFollowing}
                  source={`follow_list_${type}`}
                  onChange={(following) => updateFollow(item.userId, following)}
                />
              ) : (
                <Link
                  href="/signin"
                  className="ctaMain followBtn"
                  onClick={() => trackEvent("login_click", { source: "follow_list_cta" })}
                >
                  <span className="ctaMainLabel">{t.followList.enterBtn}</span>
                </Link>
              )}
            </div>
          ))
        ) : (
          <p className="followListEmpty">
            {type === "following"
              ? ownerIsViewer
                ? t.followList.emptyFollowingSelf
                : t.followList.emptyFollowingOther(ownerDisplayName)
              : ownerIsViewer
                ? t.followList.emptyFollowersSelf
                : t.followList.emptyFollowersOther(ownerDisplayName)}
          </p>
        )}
      </div>

      <SocialDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} source="follow_list" />
    </main>
  );
}
