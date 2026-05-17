"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ShowRecord, Viewer } from "@/lib/show-types";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { SocialDrawer } from "@/app/ui/social-drawer";
import { ProfileHeader } from "@/app/ui/profile-header";
import { buildArtistImageKey, fetchArtistImageClient } from "@/lib/artist-image-client";
import { getWalletEntries, hydrateWalletFromServer, type WalletEntry } from "@/lib/wallet-storage";
import {
  daysUntilShow,
  formatDatePtBrLong,
  formatPostDate,
  formatVenueLine,
  groupShowsByYearDesc,
  isFutureOrTodayShow
} from "@/lib/show-utils";
import type { ViewerProfile } from "@/lib/auth";
import type {
  FollowFeedItem,
  TrendingShow,
  UserProfileWithCounts
} from "@/lib/social-types";
import { trackEvent } from "@/lib/analytics";

type HomeTab = "novidades" | "meus-shows";

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="iconSvg">
      <path
        d="M4 7h16 M4 12h16 M4 17h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="iconSvg">
      <path
        d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79L20 21.5 21.5 20l-6-6Zm-6 0A4.5 4.5 0 1 1 10 5a4.5 4.5 0 0 1-.5 9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TopBarSocial({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <header className="topBarSocial">
      <Link href="/" aria-label="Ir para a home" className="brandLogoLink">
        <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
      </Link>
      <button
        type="button"
        className="hamburgerBtn iconBtn"
        aria-label="Abrir menu"
        onClick={() => {
          trackEvent("social_drawer_open", { source: "home_topbar" });
          onOpenDrawer();
        }}
      >
        <HamburgerIcon />
      </button>
    </header>
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

function buildAvatarStyle(url: string): CSSProperties {
  const sanitized = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return { backgroundImage: `url("${sanitized}")` };
}

type FeedTicketProps = {
  item: FollowFeedItem;
  imageUrl?: string;
  onOpenDetail: (showId: string) => void;
};

function FeedActivityItem({ item, imageUrl, onOpenDetail }: FeedTicketProps) {
  const verbLabel = item.action === "went" ? "Foi" : "Vai";
  const verbClass = item.action === "went" ? "verbWent" : "verbGoing";

  return (
    <article className="activityItem">
      <header className="activityHeader">
        <Link
          href={`/u/${encodeURIComponent(item.actor.userId)}`}
          className="activityAvatarLink"
          aria-label={`Abrir perfil de ${item.actor.displayName}`}
          onClick={() => trackEvent("activity_avatar_click", { target_user_id: item.actor.userId })}
        >
          {item.actor.avatarUrl ? (
            <span className="activityAvatar activityAvatarPhoto" style={buildAvatarStyle(item.actor.avatarUrl)} aria-hidden />
          ) : (
            <span className="activityAvatar activityAvatarFallback" aria-hidden />
          )}
        </Link>
        <div className="activityHeaderText">
          <p className="activityNameLine">
            <Link
              href={`/u/${encodeURIComponent(item.actor.userId)}`}
              className="activityName"
              onClick={() => trackEvent("activity_name_click", { target_user_id: item.actor.userId })}
            >
              {item.actor.displayName}
            </Link>
            <span className={`activityVerb ${verbClass}`}>{verbLabel}</span>
          </p>
          <p className="activityDate">{formatPostDate(item.occurredAtIso)}</p>
        </div>
      </header>
      <TicketRow show={item.show} imageUrl={imageUrl} onOpenDetail={onOpenDetail} />
    </article>
  );
}

type TrendingPanelProps = {
  trending: TrendingShow[];
  loading: boolean;
  resolveShowImageUrl: (show: ShowRecord) => string | undefined;
  onOpenShow: (show: ShowRecord) => void;
};

function TrendingShowsPanel({ trending, loading, resolveShowImageUrl, onOpenShow }: TrendingPanelProps) {
  if (loading) {
    return (
      <section className="section" aria-label="Carregando shows em alta">
        <h2 className="sectionTitle">Shows em alta</h2>
        <div className="slider sliderPeek skeletonSlider" aria-hidden>
          <div className="skeletonCard" />
          <div className="skeletonCard" />
        </div>
      </section>
    );
  }

  if (!trending.length) return null;

  return (
    <section className="section" aria-labelledby="shows-em-alta">
      <h2 id="shows-em-alta" className="sectionTitle">
        Shows em alta
      </h2>
      <div className={`slider ${trending.length > 1 ? "sliderPeek" : ""}`}>
        {trending.map(({ show }) => (
          <button
            key={show.id}
            type="button"
            className="cardLink cardButtonReset"
            onClick={() => {
              trackEvent("show_detail_open", { source: "home_trending", show_id: show.id });
              onOpenShow(show);
            }}
          >
            <EventCard show={show} imageUrl={resolveShowImageUrl(show)} />
          </button>
        ))}
      </div>
    </section>
  );
}

type FollowingPanelProps = {
  items: FollowFeedItem[];
  loading: boolean;
  followsAnyone: boolean;
  resolveShowImageUrl: (show: ShowRecord) => string | undefined;
  onOpenShow: (show: ShowRecord) => void;
  onOpenFriendsDrawer: () => void;
};

function FollowingFeedPanel({
  items,
  loading,
  followsAnyone,
  resolveShowImageUrl,
  onOpenShow,
  onOpenFriendsDrawer
}: FollowingPanelProps) {
  if (loading) {
    return (
      <section className="section" aria-label="Carregando novidades dos amigos">
        <h2 className="sectionTitle">Seguindo</h2>
        <div className="activityFeed skeletonFeed" aria-hidden>
          <div className="skeletonTicket" />
          <div className="skeletonTicket" />
        </div>
      </section>
    );
  }

  if (!followsAnyone) {
    return (
      <section className="section" aria-labelledby="seguindo-empty">
        <h2 id="seguindo-empty" className="sectionTitle">
          Seguindo
        </h2>
        <div className="emptyBox emptyFollowState">
          <p className="emptyFollowText">
            Comece a seguir gente que também guarda memórias de shows. Vocês podem se reencontrar nos próximos.
          </p>
          <Link
            href="/search?tab=amigos"
            className="chip chipGhost emptyFollowCta"
            onClick={() => {
              trackEvent("empty_following_cta_click", { source: "home_following_empty" });
              onOpenFriendsDrawer();
            }}
          >
            Buscar amigos
          </Link>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="section" aria-labelledby="seguindo-quiet">
        <h2 id="seguindo-quiet" className="sectionTitle">
          Seguindo
        </h2>
        <p className="emptyBox">Ninguém que você segue marcou show por aqui ainda. Logo aparece algo.</p>
      </section>
    );
  }

  return (
    <section className="section" aria-labelledby="seguindo">
      <h2 id="seguindo" className="sectionTitle">
        Seguindo
      </h2>
      <div className="activityFeed">
        {items.map((item) => (
          <FeedActivityItem
            key={item.id}
            item={item}
            imageUrl={resolveShowImageUrl(item.show)}
            onOpenDetail={(showId) => {
              trackEvent("show_detail_open", { source: "home_following_feed", show_id: showId });
              onOpenShow(item.show);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function splitWallet(entries: WalletEntry[]) {
  const shows = entries.map((entry) => entry.show);
  return {
    futureShows: shows.filter((show) => isFutureOrTodayShow(show.eventDateIso)),
    pastShows: shows.filter((show) => !isFutureOrTodayShow(show.eventDateIso))
  };
}

type MyShowsPanelProps = {
  futureShows: ShowRecord[];
  pastShows: ShowRecord[];
  resolveShowImageUrl: (show: ShowRecord) => string | undefined;
  onOpenShow: (show: ShowRecord) => void;
};

function MyShowsPanel({ futureShows, pastShows, resolveShowImageUrl, onOpenShow }: MyShowsPanelProps) {
  const groupedPast = useMemo(() => groupShowsByYearDesc(pastShows), [pastShows]);

  if (!futureShows.length && !pastShows.length) {
    return (
      <section className="myShowsEmpty section">
        <p className="emptyBox">
          Sua carteira começa na busca. <br />
          Encontre um show e marque como <strong>Eu fui</strong> ou <strong>Eu vou</strong>.
        </p>
        <Link
          href="/search?tab=shows"
          className="ctaMain"
          onClick={() => trackEvent("my_shows_empty_cta", { source: "home_my_shows_empty" })}
        >
          <span className="ctaMainLabel">Buscar meus shows</span>
        </Link>
      </section>
    );
  }

  return (
    <>
      {futureShows.length ? (
        <section className="section" aria-labelledby="shows-futuros">
          <h2 id="shows-futuros" className="sectionTitle">
            Eu vou!
          </h2>
          <div className={`slider ${futureShows.length > 1 ? "sliderPeek" : ""}`}>
            {futureShows.map((show) => (
              <button
                key={show.id}
                type="button"
                className="cardLink cardButtonReset"
                onClick={() => {
                  trackEvent("show_detail_open", { source: "my_shows_future_slider", show_id: show.id });
                  onOpenShow(show);
                }}
              >
                <EventCard show={show} imageUrl={resolveShowImageUrl(show)} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {groupedPast.length ? (
        <section className="section" aria-label="Shows passados agrupados por ano">
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
                      trackEvent("show_detail_open", { source: "my_shows_past_list", show_id: showId });
                      onOpenShow(show);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

function TabsBar({ active, onChange }: { active: HomeTab; onChange: (tab: HomeTab) => void }) {
  return (
    <div className="tabsBar" role="tablist" aria-label="Seções da home">
      <button
        type="button"
        role="tab"
        aria-selected={active === "novidades"}
        className={`tab ${active === "novidades" ? "isActive" : ""}`}
        onClick={() => {
          if (active === "novidades") return;
          trackEvent("home_tab_change", { tab: "novidades" });
          onChange("novidades");
        }}
      >
        Novidades
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "meus-shows"}
        className={`tab ${active === "meus-shows" ? "isActive" : ""}`}
        onClick={() => {
          if (active === "meus-shows") return;
          trackEvent("home_tab_change", { tab: "meus_shows" });
          onChange("meus-shows");
        }}
      >
        Meus shows
      </button>
    </div>
  );
}

export function HomeClient({ viewer }: { viewer: ViewerProfile }) {
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [overlayInitialData, setOverlayInitialData] = useState<ShowRecord | undefined>(undefined);
  const [artistImageMap, setArtistImageMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<HomeTab>("novidades");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [profile, setProfile] = useState<UserProfileWithCounts | null>(null);
  const [trending, setTrending] = useState<TrendingShow[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FollowFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const openShowOverlay = useCallback((show: ShowRecord) => {
    setSelectedShowId(show.id);
    setOverlayInitialData(show);
    window.history.pushState({ showOverlay: show.id }, "", `/show/${encodeURIComponent(show.id)}`);
  }, []);

  const closeShowOverlay = useCallback(() => {
    setSelectedShowId(null);
    setOverlayInitialData(undefined);
    window.history.pushState({}, "", "/");
  }, []);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { showOverlay?: string } | null;
      if (state?.showOverlay) {
        setSelectedShowId(state.showOverlay);
      } else {
        setSelectedShowId(null);
        setOverlayInitialData(undefined);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hydrateWalletFromServer().then((result) => {
      if (!cancelled) setWalletEntries(result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch("/api/profiles/me", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { profile: UserProfileWithCounts };
        if (!cancelled) setProfile(payload.profile);
      } catch {
        // silent — profile shows fallback
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTrending() {
      try {
        const response = await fetch("/api/shows/trending", { cache: "no-store" });
        if (!response.ok) throw new Error("trending");
        const payload = (await response.json()) as { shows: TrendingShow[] };
        if (!cancelled) setTrending(payload.shows ?? []);
      } catch {
        if (!cancelled) setTrending([]);
      } finally {
        if (!cancelled) setTrendingLoading(false);
      }
    }
    void loadTrending();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadFeed() {
      try {
        const response = await fetch("/api/feed/following", { cache: "no-store" });
        if (!response.ok) throw new Error("feed");
        const payload = (await response.json()) as { items: FollowFeedItem[] };
        if (!cancelled) setFeedItems(payload.items ?? []);
      } catch {
        if (!cancelled) setFeedItems([]);
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    }
    void loadFeed();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let lastFocusSync = 0;
    function syncWalletFromServer() {
      const now = Date.now();
      if (now - lastFocusSync < 2000) return;
      lastFocusSync = now;
      void hydrateWalletFromServer().then((result) => {
        setWalletEntries(result.entries);
      });
    }
    function syncWalletFromLocal() {
      setWalletEntries(getWalletEntries());
    }
    window.addEventListener("focus", syncWalletFromServer);
    window.addEventListener("storage", syncWalletFromLocal);
    return () => {
      window.removeEventListener("focus", syncWalletFromServer);
      window.removeEventListener("storage", syncWalletFromLocal);
    };
  }, []);

  const { futureShows, pastShows } = useMemo(() => splitWallet(walletEntries), [walletEntries]);

  const allShowsForImages = useMemo(() => {
    const shows: ShowRecord[] = [];
    for (const entry of walletEntries) shows.push(entry.show);
    for (const t of trending) shows.push(t.show);
    for (const f of feedItems) shows.push(f.show);
    return shows;
  }, [walletEntries, trending, feedItems]);

  useEffect(() => {
    if (!allShowsForImages.length) return;
    let cancelled = false;

    async function loadArtistImages() {
      const candidates = new Map<
        string,
        { artistName: string; artistMbid?: string; preloaded?: string }
      >();

      for (const show of allShowsForImages) {
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
  }, [allShowsForImages]);

  const resolveShowImageUrl = useCallback(
    (show: ShowRecord) => {
      if (show.artistImageUrl) return show.artistImageUrl;
      const key = buildArtistImageKey(show.artist, show.artistMbid);
      if (!key) return undefined;
      return artistImageMap[key];
    },
    [artistImageMap]
  );

  const followsAnyone = (profile?.followingCount ?? 0) > 0;

  return (
    <main className="page pageSocial">
      <TopBarSocial onOpenDrawer={() => setDrawerOpen(true)} />

      <Link
        href="/search"
        className="search searchButton searchNavButton searchNavSocial"
        onClick={() => {
          trackEvent("search_entry_click", { source: "home_top_search" });
        }}
      >
        <SearchIcon />
        <span>Encontre shows incríveis</span>
      </Link>

      <ProfileHeader profile={profile} fallbackName={viewer.name} fallbackAvatarUrl={viewer.avatarUrl} />

      <TabsBar active={activeTab} onChange={setActiveTab} />

      <div key={activeTab} className="tabPanel">
        {activeTab === "novidades" ? (
          <>
            <TrendingShowsPanel
              trending={trending}
              loading={trendingLoading}
              resolveShowImageUrl={resolveShowImageUrl}
              onOpenShow={openShowOverlay}
            />
            <FollowingFeedPanel
              items={feedItems}
              loading={feedLoading}
              followsAnyone={followsAnyone}
              resolveShowImageUrl={resolveShowImageUrl}
              onOpenShow={openShowOverlay}
              onOpenFriendsDrawer={() => setDrawerOpen(true)}
            />
            {!trendingLoading && !trending.length && !feedLoading && !followsAnyone ? (
              <section className="section">
                <p className="emptyBox">
                  Por enquanto está calmo por aqui. Salva uns shows na carteira e segue amigos pra ver novidades.
                </p>
              </section>
            ) : null}
          </>
        ) : (
          <MyShowsPanel
            futureShows={futureShows}
            pastShows={pastShows}
            resolveShowImageUrl={resolveShowImageUrl}
            onOpenShow={openShowOverlay}
          />
        )}
      </div>

      <SocialDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} source="home" />

      {selectedShowId ? (
        <ShowDetailClient
          id={selectedShowId}
          mode="overlay"
          onClose={closeShowOverlay}
          isAuthenticated
          viewer={{ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } satisfies Viewer}
          initialData={
            overlayInitialData
              ? { ...overlayInitialData, songNames: [], setlistSections: [] }
              : undefined
          }
        />
      ) : null}
    </main>
  );
}
