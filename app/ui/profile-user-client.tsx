"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ShowRecord, Viewer } from "@/lib/show-types";
import type { ViewerProfile } from "@/lib/auth";
import type { PublicWalletEntry, UserProfileWithCounts } from "@/lib/social-types";
import { FollowButton, ProfileHeader } from "@/app/ui/profile-header";
import { SocialDrawer } from "@/app/ui/social-drawer";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import {
  daysUntilShow,
  formatDatePtBrLong,
  formatVenueLine,
  groupShowsByYearDesc,
  isFutureOrTodayShow
} from "@/lib/show-utils";
import { buildArtistImageKey, fetchArtistImageClient } from "@/lib/artist-image-client";
import { countAttendedShows } from "@/lib/social-utils";
import { trackEvent } from "@/lib/analytics";

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="iconSvg">
      <path d="M4 7h16 M4 12h16 M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="iconSvg">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function buildPhotoStyle(imageUrl: string, overlay: "hero" | "thumb"): CSSProperties {
  const sanitized = imageUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const heroOverlay = "linear-gradient(180deg, rgba(7, 14, 30, 0.18), rgba(7, 14, 30, 0.5))";
  const thumbOverlay = "linear-gradient(180deg, rgba(9, 19, 43, 0.15), rgba(9, 19, 43, 0.34))";
  return {
    backgroundImage: `${overlay === "hero" ? heroOverlay : thumbOverlay}, url("${sanitized}")`,
    backgroundPosition: "center",
    backgroundSize: "cover"
  };
}

function EventCard({ show, imageUrl }: { show: ShowRecord; imageUrl?: string }) {
  const daysAway = daysUntilShow(show.eventDateIso);
  const dateLabel = formatDatePtBrLong(show.eventDateIso);
  return (
    <article className="card">
      <div className={`cardImage ${imageUrl ? "hasPhoto" : ""}`} style={imageUrl ? buildPhotoStyle(imageUrl, "hero") : undefined}>
        {imageUrl ? null : show.artist}
      </div>
      <div className="cardBody">
        <div className="cardMeta">
          {daysAway > 0 ? `Faltam ${daysAway} dias!` : daysAway === 0 ? "É hoje!" : dateLabel}
        </div>
        <h3 className="cardTitle">{show.artist}</h3>
        <div className="cardVenue venueWithPin">
          <span className="venueText">{formatVenueLine(show)}</span>
        </div>
      </div>
    </article>
  );
}

function TicketRow({
  show,
  imageUrl,
  onOpenDetail
}: {
  show: ShowRecord;
  imageUrl?: string;
  onOpenDetail: (showId: string) => void;
}) {
  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset" onClick={() => onOpenDetail(show.id)}>
        <div className={`ticketThumb ${imageUrl ? "hasPhoto" : ""}`} style={imageUrl ? buildPhotoStyle(imageUrl, "thumb") : undefined}>
          {imageUrl ? null : show.artist}
        </div>
        <div className="ticketBody">
          <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
          <h3 className="ticketName">{show.artist}</h3>
          <p className="ticketVenue venueWithPin">
            <span className="venueText">{formatVenueLine(show)}</span>
          </p>
        </div>
      </button>
    </div>
  );
}

type ProfileUserClientProps = {
  profile: UserProfileWithCounts;
  wallet: PublicWalletEntry[];
  viewer: ViewerProfile | null;
  isAuthenticated: boolean;
};

export function ProfileUserClient({ profile: initialProfile, wallet, viewer, isAuthenticated }: ProfileUserClientProps) {
  const [profile, setProfile] = useState<UserProfileWithCounts>(initialProfile);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [artistImageMap, setArtistImageMap] = useState<Record<string, string>>({});
  const [selectedShow, setSelectedShow] = useState<ShowRecord | null>(null);

  const { futureShows, pastShows, totalAttended, attendedThisYear } = useMemo(() => {
    const shows = wallet.map((entry) => entry.show);
    const future = shows.filter((show) => isFutureOrTodayShow(show.eventDateIso));
    const past = shows.filter((show) => !isFutureOrTodayShow(show.eventDateIso));
    const counts = countAttendedShows(shows);
    return {
      futureShows: future,
      pastShows: past,
      totalAttended: counts.totalAttended,
      attendedThisYear: counts.attendedThisYear
    };
  }, [wallet]);

  const groupedPast = useMemo(() => groupShowsByYearDesc(pastShows), [pastShows]);

  useEffect(() => {
    const allShows = [...futureShows, ...pastShows];
    if (!allShows.length) return;
    let cancelled = false;

    async function loadArtistImages() {
      const candidates = new Map<
        string,
        { artistName: string; artistMbid?: string; preloaded?: string }
      >();
      for (const show of allShows) {
        const key = buildArtistImageKey(show.artist, show.artistMbid);
        if (!key || candidates.has(key)) continue;
        candidates.set(key, {
          artistName: show.artist,
          artistMbid: show.artistMbid,
          preloaded: show.artistImageUrl
        });
      }
      const entries = Array.from(candidates.entries());
      const resolved = await Promise.all(
        entries.map(async ([key, candidate]) => {
          if (candidate.preloaded) return [key, candidate.preloaded] as const;
          const payload = await fetchArtistImageClient({
            artistName: candidate.artistName,
            artistMbid: candidate.artistMbid
          });
          return [key, payload.imageUrl] as const;
        })
      );
      if (cancelled) return;
      setArtistImageMap((current) => {
        const next = { ...current };
        for (const [key, imageUrl] of resolved) {
          if (!imageUrl) continue;
          next[key] = imageUrl;
        }
        return next;
      });
    }

    void loadArtistImages();
    return () => {
      cancelled = true;
    };
  }, [futureShows, pastShows]);

  function resolveShowImageUrl(show: ShowRecord) {
    if (show.artistImageUrl) return show.artistImageUrl;
    const key = buildArtistImageKey(show.artist, show.artistMbid);
    if (!key) return undefined;
    return artistImageMap[key];
  }

  function openShowOverlay(show: ShowRecord) {
    setSelectedShow(show);
    window.history.pushState({ showOverlay: show.id }, "", `/show/${encodeURIComponent(show.id)}`);
  }

  function closeShowOverlay() {
    setSelectedShow(null);
    window.history.pushState({}, "", `/u/${encodeURIComponent(profile.userId)}`);
  }

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { showOverlay?: string } | null;
      if (!state?.showOverlay) setSelectedShow(null);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const cta = !isAuthenticated ? (
    <Link
      href="/signin"
      className="ctaMain followBtn"
      onClick={() => trackEvent("login_click", { source: "profile_page_follow_cta" })}
    >
      <span className="ctaMainLabel">Entrar para seguir</span>
    </Link>
  ) : profile.isSelf ? null : (
    <FollowButton
      targetUserId={profile.userId}
      initialFollowing={profile.isViewerFollowing}
      onChange={(following, followerCount) => {
        setProfile((current) => ({
          ...current,
          isViewerFollowing: following,
          followerCount
        }));
      }}
      source="profile_page_cta"
    />
  );

  return (
    <main className="page pageSocial profilePage">
      <header className="topBarSocial">
        <Link href="/" aria-label="Ir para a home" className="brandLogoLink">
          <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
        </Link>
        {isAuthenticated ? (
          <button
            type="button"
            className="hamburgerBtn iconBtn"
            aria-label="Abrir menu"
            onClick={() => {
              trackEvent("social_drawer_open", { source: "profile_page" });
              setDrawerOpen(true);
            }}
          >
            <HamburgerIcon />
          </button>
        ) : null}
      </header>

      <Link
        href="/search?tab=amigos"
        className="profilePageBack"
        onClick={() => trackEvent("profile_page_back_click", {})}
      >
        <BackIcon />
        Voltar à busca
      </Link>

      <ProfileHeader
        profile={profile}
        fallbackName={profile.displayName}
        fallbackAvatarUrl={profile.avatarUrl}
        showsThisYear={attendedThisYear}
        showsTotal={totalAttended}
        primaryAction={cta}
      />

      {!wallet.length ? (
        <section className="section">
          <p className="emptyBox">
            {profile.displayName} ainda não guardou shows por aqui. Quando salvar um, aparece nesta página.
          </p>
        </section>
      ) : (
        <>
          {futureShows.length ? (
            <section className="section" aria-labelledby="user-future-shows">
              <h2 id="user-future-shows" className="sectionTitle">
                Vai!
              </h2>
              <div className={`slider ${futureShows.length > 1 ? "sliderPeek" : ""}`}>
                {futureShows.map((show) => (
                  <button
                    key={show.id}
                    type="button"
                    className="cardLink cardButtonReset"
                    onClick={() => {
                      trackEvent("show_detail_open", { source: "user_profile_future", show_id: show.id });
                      openShowOverlay(show);
                    }}
                  >
                    <EventCard show={show} imageUrl={resolveShowImageUrl(show)} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {groupedPast.length ? (
            <section className="section" aria-label="Shows que esse usuário foi, agrupados por ano">
              {groupedPast.map((group, index) => (
                <div key={group.year} className="yearGroup" style={{ animationDelay: `${80 + index * 60}ms` }}>
                  <h3 className="yearLabel">
                    <span>{group.year}</span>
                  </h3>
                  <div className="ticketList">
                    {group.items.map((show) => (
                      <TicketRow
                        key={show.id}
                        show={show}
                        imageUrl={resolveShowImageUrl(show)}
                        onOpenDetail={(showId) => {
                          trackEvent("show_detail_open", { source: "user_profile_past", show_id: showId });
                          openShowOverlay(show);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}

      <SocialDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} source="profile_page" />

      {selectedShow ? (
        <ShowDetailClient
          id={selectedShow.id}
          mode="overlay"
          onClose={closeShowOverlay}
          isAuthenticated={isAuthenticated}
          viewer={viewer ? ({ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } satisfies Viewer) : null}
          initialData={{ ...selectedShow, songNames: [], setlistSections: [] }}
        />
      ) : null}
    </main>
  );
}
