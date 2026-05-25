"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ShowDetailRecord, ShowRecord, Viewer } from "@/lib/show-types";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { SocialDrawer } from "@/app/ui/social-drawer";
import { ProfileHeader } from "@/app/ui/profile-header";
import { buildArtistImageKey, fetchArtistImageClient } from "@/lib/artist-image-client";
import { getWalletEntries, hydrateWalletFromServer, type WalletEntry } from "@/lib/wallet-storage";
import {
  daysUntilShow,
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
import { countAttendedShows } from "@/lib/social-utils";
import { useLocale } from "@/lib/i18n-context";
import { trackEvent } from "@/lib/analytics";

type HomeTab = "novidades" | "meus-shows";

type TrendingFiltersState = {
  country: string;
  city: string;
};

const DEFAULT_TRENDING_FILTERS: TrendingFiltersState = {
  country: "BR",
  city: ""
};

const TRENDING_COUNTRY_CODES = ["BR", "AR", "CL", "MX", "US", "GB", "PT"] as const;

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
  const { t } = useLocale();
  return (
    <header className="topBarSocial">
      <Link href="/" aria-label={t.common.goHome} className="brandLogoLink">
        <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
      </Link>
      <button
        type="button"
        className="hamburgerBtn iconBtn"
        aria-label={t.common.openMenu}
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
  const { t, formatDate } = useLocale();
  const daysAway = daysUntilShow(show.eventDateIso);
  const dateLabel = formatDate(show.eventDateIso);
  return (
    <article className="card">
      <div className={`cardImage ${imageUrl ? "hasPhoto" : ""}`} style={imageUrl ? buildPhotoStyle(imageUrl, "hero") : undefined}>
        {imageUrl ? null : show.artist}
      </div>
      <div className="cardBody">
        <div className="cardMeta">
          {daysAway > 0 ? t.home.daysLeft(daysAway) : daysAway === 0 ? t.home.today : dateLabel}
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
  const { formatDate } = useLocale();
  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset" onClick={() => onOpenDetail(show.id)}>
        <div className={`ticketThumb ${imageUrl ? "hasPhoto" : ""}`} style={imageUrl ? buildPhotoStyle(imageUrl, "thumb") : undefined}>
          {imageUrl ? null : show.artist}
        </div>
        <div className="ticketBody">
          <p className="ticketDate">{formatDate(show.eventDateIso)}</p>
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
  const { t } = useLocale();
  const verbLabel = item.action === "went" ? t.home.verbWent : t.home.verbGoing;
  const verbClass = item.action === "went" ? "verbWent" : "verbGoing";

  return (
    <article className="activityItem">
      <header className="activityHeader">
        <Link
          href={`/u/${encodeURIComponent(item.actor.userId)}`}
          className="activityAvatarLink"
          aria-label={t.common.openProfileLabel(item.actor.displayName)}
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
        </div>
      </header>
      <TicketRow show={item.show} imageUrl={imageUrl} onOpenDetail={onOpenDetail} />
    </article>
  );
}

type TrendingPanelProps = {
  trending: TrendingShow[];
  loading: boolean;
  filters: TrendingFiltersState;
  onFiltersChange: (next: TrendingFiltersState) => void;
  resolveShowImageUrl: (show: ShowRecord) => string | undefined;
  onOpenShow: (show: ShowRecord) => void;
};

const TRENDING_SLIDER_LIMIT = 3;

function TrendingFiltersBar({
  filters,
  onFiltersChange
}: {
  filters: TrendingFiltersState;
  onFiltersChange: (next: TrendingFiltersState) => void;
}) {
  const { t } = useLocale();
  const hasActive =
    filters.country !== DEFAULT_TRENDING_FILTERS.country ||
    filters.city.trim() !== "";

  const countryOptions = TRENDING_COUNTRY_CODES.map((code) => ({
    code,
    label: t.home.countries[code] ?? code
  }));

  return (
    <div className="trendingFiltersBar" role="group" aria-label={t.home.filterGroupLabel}>
      <label className="trendingFilter">
        <span className="trendingFilterLabel">{t.home.filterCountry}</span>
        <select
          className="trendingFilterSelect"
          value={filters.country}
          onChange={(event) => {
            const next = { ...filters, country: event.target.value };
            trackEvent("trending_filter_change", { kind: "country", value: next.country });
            onFiltersChange(next);
          }}
        >
          {countryOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="trendingFilter">
        <span className="trendingFilterLabel">{t.home.filterCity}</span>
        <input
          className="trendingFilterInput"
          type="text"
          value={filters.city}
          placeholder={t.home.filterAllCities}
          onChange={(event) => {
            onFiltersChange({ ...filters, city: event.target.value });
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value) trackEvent("trending_filter_change", { kind: "city", value });
          }}
        />
      </label>
      {hasActive ? (
        <button
          type="button"
          className="trendingFilterClear"
          onClick={() => {
            trackEvent("trending_filter_clear", {});
            onFiltersChange({ ...DEFAULT_TRENDING_FILTERS });
          }}
          aria-label={t.home.filterClearLabel}
        >
          {t.home.filterClear}
        </button>
      ) : null}
    </div>
  );
}

function TrendingShowsPanel({ trending, loading, filters, onFiltersChange, resolveShowImageUrl, onOpenShow }: TrendingPanelProps) {
  const { t } = useLocale();
  const sliderItems = trending.slice(0, TRENDING_SLIDER_LIMIT);
  const listItems = trending.slice(TRENDING_SLIDER_LIMIT);

  return (
    <section className="section" aria-labelledby="shows-em-alta">
      <h2 id="shows-em-alta" className="sectionTitle">
        {t.home.trendingTitle}
      </h2>
      <TrendingFiltersBar filters={filters} onFiltersChange={onFiltersChange} />
      {loading ? (
        <div className="slider sliderPeek skeletonSlider" aria-hidden>
          <div className="skeletonCard" />
          <div className="skeletonCard" />
        </div>
      ) : trending.length ? (
        <>
          <div className={`slider ${sliderItems.length > 1 ? "sliderPeek" : ""}`}>
            {sliderItems.map(({ show }) => (
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
          {listItems.length ? (
            <div className="trendingListWrap">
              <h3 className="trendingListTitle">{t.home.trendingMore}</h3>
              <div className="ticketList">
                {listItems.map(({ show }) => (
                  <TicketRow
                    key={show.id}
                    show={show}
                    imageUrl={resolveShowImageUrl(show)}
                    onOpenDetail={(showId) => {
                      trackEvent("show_detail_open", { source: "home_trending_list", show_id: showId });
                      onOpenShow(show);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="emptyBox trendingEmpty">{t.home.trendingEmpty}</p>
      )}
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
  const { t } = useLocale();

  if (loading) {
    return (
      <section className="section" aria-label={t.home.followingLoadingLabel}>
        <h2 className="sectionTitle">{t.home.followingTitle}</h2>
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
          {t.home.followingTitle}
        </h2>
        <div className="emptyBox emptyFollowState">
          <p className="emptyFollowText">
            {t.home.followingEmptyText}
          </p>
          <Link
            href="/search?tab=amigos"
            className="chip chipGhost emptyFollowCta"
            onClick={() => {
              trackEvent("empty_following_cta_click", { source: "home_following_empty" });
              onOpenFriendsDrawer();
            }}
          >
            {t.home.followingEmptyCta}
          </Link>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="section" aria-labelledby="seguindo-quiet">
        <h2 id="seguindo-quiet" className="sectionTitle">
          {t.home.followingTitle}
        </h2>
        <p className="emptyBox">{t.home.followingQuietText}</p>
      </section>
    );
  }

  return (
    <section className="section" aria-labelledby="seguindo">
      <h2 id="seguindo" className="sectionTitle">
        {t.home.followingTitle}
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
  const { t } = useLocale();
  const groupedPast = useMemo(() => groupShowsByYearDesc(pastShows), [pastShows]);

  if (!futureShows.length && !pastShows.length) {
    return (
      <section className="myShowsEmpty section">
        <p className="emptyBox">
          {t.home.myShowsEmptyIntro} <br />
          Encontre um show e marque como <strong>{t.home.myShowsEmptyIWent}</strong> ou <strong>{t.home.myShowsEmptyIGo}</strong>.
        </p>
        <Link
          href="/search?tab=shows"
          className="ctaMain"
          onClick={() => trackEvent("my_shows_empty_cta", { source: "home_my_shows_empty" })}
        >
          <span className="ctaMainLabel">{t.home.myShowsEmptyCta}</span>
        </Link>
      </section>
    );
  }

  return (
    <>
      {futureShows.length ? (
        <section className="section" aria-labelledby="shows-futuros">
          <h2 id="shows-futuros" className="sectionTitle">
            {t.home.myShowsFutureTitle}
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
        <section className="section" aria-label="shows passados">
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
  const { t } = useLocale();
  return (
    <div className="tabsBar" role="tablist" aria-label={t.home.homeTabsLabel}>
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
        {t.home.tabWhatsNew}
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
        {t.home.tabMyShows}
      </button>
    </div>
  );
}

export function HomeClient({ viewer, initialTab = "novidades" }: { viewer: ViewerProfile; initialTab?: HomeTab }) {
  const { t } = useLocale();
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [selectedShow, setSelectedShow] = useState<{ id: string; initialData?: ShowRecord } | null>(null);
  const [artistImageMap, setArtistImageMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<HomeTab>(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [profile, setProfile] = useState<UserProfileWithCounts | null>(null);
  const [trending, setTrending] = useState<TrendingShow[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingFilters, setTrendingFilters] = useState<TrendingFiltersState>(DEFAULT_TRENDING_FILTERS);
  const [feedItems, setFeedItems] = useState<FollowFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const openShowOverlay = useCallback((show: ShowRecord) => {
    setSelectedShow({ id: show.id, initialData: show });
    window.history.pushState({ showOverlay: show.id }, "", `/show/${encodeURIComponent(show.id)}`);
  }, []);

  const closeShowOverlay = useCallback(() => {
    setSelectedShow(null);
    window.history.pushState({}, "", "/");
  }, []);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { showOverlay?: string } | null;
      if (state?.showOverlay) {
        setSelectedShow({ id: state.showOverlay });
      } else {
        setSelectedShow(null);
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
    const params = new URLSearchParams();
    if (trendingFilters.country) params.set("country", trendingFilters.country);
    const trimmedCity = trendingFilters.city.trim();
    if (trimmedCity) params.set("city", trimmedCity);
    const queryString = params.toString();

    setTrendingLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/shows/trending${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store"
        });
        if (!response.ok) throw new Error("trending");
        const payload = (await response.json()) as { shows: TrendingShow[] };
        if (!cancelled) setTrending(payload.shows ?? []);
      } catch {
        if (!cancelled) setTrending([]);
      } finally {
        if (!cancelled) setTrendingLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trendingFilters.country, trendingFilters.city]);

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

  const { totalAttended, attendedThisYear } = useMemo(
    () => countAttendedShows(walletEntries.map((entry) => entry.show)),
    [walletEntries]
  );

  const allShowsForImages = useMemo(() => {
    const shows: ShowRecord[] = [];
    for (const entry of walletEntries) shows.push(entry.show);
    for (const item of trending) shows.push(item.show);
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
        <span>{t.home.searchPlaceholder}</span>
      </Link>

      <ProfileHeader
        profile={profile}
        fallbackName={viewer.name}
        fallbackAvatarUrl={viewer.avatarUrl}
        showsThisYear={attendedThisYear}
        showsTotal={totalAttended}
      />

      <TabsBar
        active={activeTab}
        onChange={(nextTab) => {
          setActiveTab(nextTab);
          const url = new URL(window.location.href);
          if (nextTab === "novidades") url.searchParams.delete("tab");
          else url.searchParams.set("tab", nextTab);
          window.history.replaceState({}, "", url.toString());
        }}
      />

      <div key={activeTab} className="tabPanel">
        {activeTab === "novidades" ? (
          <>
            <TrendingShowsPanel
              trending={trending}
              loading={trendingLoading}
              filters={trendingFilters}
              onFiltersChange={setTrendingFilters}
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
                  {t.home.homeCalmText}
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

      {selectedShow ? (
        <ShowDetailClient
          id={selectedShow.id}
          mode="overlay"
          onClose={closeShowOverlay}
          isAuthenticated
          viewer={{ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } satisfies Viewer}
          initialData={
            selectedShow.initialData
              ? ({ ...selectedShow.initialData, songNames: [], setlistSections: [] } satisfies ShowDetailRecord)
              : undefined
          }
        />
      ) : null}
    </main>
  );
}
