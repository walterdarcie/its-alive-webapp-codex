"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { SocialDrawer } from "@/app/ui/social-drawer";
import { FollowButton } from "@/app/ui/profile-header";
import type { ShowDetailRecord, ShowRecord, Viewer } from "@/lib/show-types";
import { formatVenueLine } from "@/lib/show-utils";
import type { ViewerProfile } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";

export type SearchTab = "shows" | "amigos";

type SearchResponse = {
  shows: ShowRecord[];
  page: number;
  total: number;
  itemsPerPage: number;
};

type SearchStateMeta = {
  pageLoaded: number;
  hasMore: boolean;
  total: number;
};

type FriendResult = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isViewerFollowing: boolean;
};

const NO_RESULT_ANALYTICS_KEY = "its-alive.search.no-results.v1";

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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="iconSvg">
      <path
        d="m18.3 5.71-1.41-1.42L12 9.17 7.11 4.29 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.41L12 12l4.89 4.9 1.41-1.41-4.89-4.89 4.89-4.89Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="iconSvg">
      <path d="M4 7h16 M4 12h16 M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function TopBarSocial({ onOpenDrawer, isAuthenticated }: { onOpenDrawer: () => void; isAuthenticated: boolean }) {
  return (
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
            trackEvent("social_drawer_open", { source: "search_topbar" });
            onOpenDrawer();
          }}
        >
          <HamburgerIcon />
        </button>
      ) : (
        <Link
          href="/signin"
          className="iconBtn"
          aria-label="Fazer login"
          onClick={() => trackEvent("login_click", { source: "search_topbar" })}
        >
          <span className="avatarFallbackIcon" aria-hidden />
        </Link>
      )}
    </header>
  );
}

function SearchResultRow({ show, onOpenDetail }: { show: ShowRecord; onOpenDetail: (show: ShowRecord) => void }) {
  const eventDate = new Date(`${show.eventDateIso}T00:00:00`);
  const ptBrMonthAbbr = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const month = ptBrMonthAbbr[eventDate.getMonth()] ?? "";
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(eventDate);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(eventDate);

  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset searchTicketDateLayout" onClick={() => onOpenDetail(show)}>
        <div className="ticketDateStub" aria-hidden>
          <span className="ticketDateStubMonth">{month}</span>
          <span className="ticketDateStubDay">{day}</span>
          <span className="ticketDateStubYear">{year}</span>
        </div>
        <div className="ticketBody searchTicketBody">
          <h3 className="ticketName">{show.artist}</h3>
          <p className="ticketVenue venueWithPin">
            <span className="venueText">{formatVenueLine(show)}</span>
          </p>
          {show.tourName ? <p className="resultMeta">{show.tourName}</p> : null}
        </div>
      </button>
    </div>
  );
}

function buildAvatarStyle(url: string): CSSProperties {
  const sanitized = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return { backgroundImage: `url("${sanitized}")` };
}

function FriendResultRow({ result, isAuthenticated }: { result: FriendResult; isAuthenticated: boolean }) {
  return (
    <div className="friendResultRow">
      <Link
        href={`/u/${encodeURIComponent(result.userId)}`}
        className="friendResultAvatarLink"
        aria-label={`Abrir perfil de ${result.displayName}`}
        onClick={() => trackEvent("friend_result_avatar_click", { target_user_id: result.userId })}
      >
        {result.avatarUrl ? (
          <span className="friendResultAvatar friendResultAvatarPhoto" style={buildAvatarStyle(result.avatarUrl)} aria-hidden />
        ) : (
          <span className="friendResultAvatar friendResultAvatarFallback" aria-hidden />
        )}
      </Link>
      <div className="friendResultIdentity">
        <h3 className="friendResultName">
          <Link
            href={`/u/${encodeURIComponent(result.userId)}`}
            onClick={() => trackEvent("friend_result_name_click", { target_user_id: result.userId })}
          >
            {result.displayName}
          </Link>
        </h3>
        <p className="friendResultHint">Toque para abrir o perfil</p>
      </div>
      {isAuthenticated ? (
        <FollowButton
          targetUserId={result.userId}
          initialFollowing={result.isViewerFollowing}
          source="search_friend_result"
        />
      ) : null}
    </div>
  );
}

export function SearchPageClient({
  viewer,
  isAuthenticated = true,
  initialQuery,
  initialTab = "shows"
}: {
  viewer: ViewerProfile | null;
  isAuthenticated?: boolean;
  initialQuery?: string;
  initialTab?: SearchTab;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const deferredQuery = useDeferredValue(query);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Shows search state
  const [searchResults, setSearchResults] = useState<ShowRecord[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchStateMeta>({
    pageLoaded: -1,
    hasMore: false,
    total: 0
  });
  const [selectedShow, setSelectedShow] = useState<{ id: string; initialData?: ShowRecord } | null>(null);

  // Friends search state
  const [friendResults, setFriendResults] = useState<FriendResult[]>([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  function openShowOverlay(show: ShowRecord) {
    setSelectedShow({ id: show.id, initialData: show });
    window.history.pushState({ showOverlay: show.id }, "", `/show/${encodeURIComponent(show.id)}`);
  }

  function closeShowOverlay() {
    setSelectedShow(null);
    window.history.pushState({}, "", `/search?tab=${activeTab}`);
  }

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

  const searchSentinelRef = useRef<HTMLDivElement | null>(null);
  const activeQueryRef = useRef("");
  const noResultLoggedRef = useRef<string>("");
  const trackedSearchQueryRef = useRef<string>("");

  const normalizedQuery = deferredQuery.trim();

  // Shows search effect — only when tab is "shows"
  useEffect(() => {
    if (activeTab !== "shows") {
      activeQueryRef.current = "";
      return;
    }
    const q = normalizedQuery.normalize("NFC");
    activeQueryRef.current = q;

    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      setSearchLoadingMore(false);
      setSearchMeta({ pageLoaded: -1, hasMore: false, total: 0 });
      noResultLoggedRef.current = "";
      return;
    }

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      setSearchMeta({ pageLoaded: -1, hasMore: false, total: 0 });
      if (trackedSearchQueryRef.current !== q) {
        trackEvent("search_performed", { source: "search_page", query_length: q.length });
        trackedSearchQueryRef.current = q;
      }

      try {
        const payload = await fetchSearchPage(q, 0);
        if (isCancelled || activeQueryRef.current !== q) return;

        const ranked = rankSearchResults(q, payload.shows ?? []);
        startTransition(() => {
          setSearchResults(ranked);
        });
        setSearchMeta(computeSearchMeta(payload));
        trackEvent("search_results_loaded", {
          source: "search_page",
          query_length: q.length,
          result_count: ranked.length
        });
        if (!ranked.length) {
          trackEvent("search_no_results", { source: "search_page", query_length: q.length });
          logNoResultSearch(q, noResultLoggedRef);
        } else {
          noResultLoggedRef.current = "";
        }
      } catch (error) {
        if (isCancelled) return;
        setSearchResults([]);
        setSearchMeta({ pageLoaded: -1, hasMore: false, total: 0 });
        setSearchError(error instanceof Error ? error.message : "Não conseguimos buscar os shows agora.");
      } finally {
        if (!isCancelled) setSearchLoading(false);
      }
    }, 700);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, activeTab]);

  // Friends search effect — only when tab is "amigos"
  useEffect(() => {
    if (activeTab !== "amigos") {
      return;
    }
    const q = normalizedQuery.normalize("NFC");
    if (q.length < 2) {
      setFriendResults([]);
      setFriendError(null);
      setFriendLoading(false);
      return;
    }

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setFriendLoading(true);
      setFriendError(null);
      trackEvent("friend_search_performed", { query_length: q.length });
      try {
        const response = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`);
        const payload = (await response.json()) as { profiles?: FriendResult[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Não conseguimos buscar amigos agora.");
        }
        if (isCancelled) return;
        setFriendResults(payload.profiles ?? []);
        trackEvent("friend_search_results_loaded", {
          query_length: q.length,
          result_count: (payload.profiles ?? []).length
        });
      } catch (error) {
        if (isCancelled) return;
        setFriendError(error instanceof Error ? error.message : "Não conseguimos buscar amigos agora.");
        setFriendResults([]);
      } finally {
        if (!isCancelled) setFriendLoading(false);
      }
    }, 350);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, activeTab]);

  useEffect(() => {
    if (activeTab !== "shows") return;
    if (normalizedQuery.length < 2) return;
    if (!searchMeta.hasMore) return;
    if (!searchSentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (searchLoading || searchLoadingMore) return;
        const nextPage = searchMeta.pageLoaded + 1;
        if (nextPage < 0) return;
        const q = activeQueryRef.current;
        if (q.length < 2) return;
        void loadMoreSearch(q, nextPage);
      },
      { root: null, rootMargin: "220px 0px", threshold: 0.01 }
    );

    observer.observe(searchSentinelRef.current);
    return () => observer.disconnect();
  }, [normalizedQuery.length, searchLoading, searchLoadingMore, searchMeta, activeTab]);

  async function loadMoreSearch(queryValue: string, page: number) {
    setSearchLoadingMore(true);
    setSearchError(null);
    try {
      const payload = await fetchSearchPage(queryValue, page);
      if (activeQueryRef.current !== queryValue) return;

      setSearchResults((current) => {
        const merged = [...current, ...(payload.shows ?? [])];
        const deduped = new Map<string, ShowRecord>();
        for (const show of merged) deduped.set(show.id, show);
        return rankSearchResults(queryValue, Array.from(deduped.values()));
      });
      setSearchMeta(computeSearchMeta(payload));
      trackEvent("search_load_more", {
        source: "search_page",
        query_length: queryValue.length,
        page
      });
    } catch (error) {
      if (activeQueryRef.current !== queryValue) return;
      setSearchError(error instanceof Error ? error.message : "Não conseguimos carregar mais shows agora.");
    } finally {
      setSearchLoadingMore(false);
    }
  }

  function changeTab(nextTab: SearchTab) {
    if (nextTab === activeTab) return;
    trackEvent("search_tab_change", { tab: nextTab });
    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url.toString());
  }

  const placeholder = activeTab === "shows" ? "Encontre shows incríveis" : "Encontre amigos pelo nome";
  const hint =
    activeTab === "shows"
      ? "Artista, cidade, ano — escreva como lembrar."
      : "Digita o nome de quem você quer encontrar.";

  return (
    <main className="page searchPage">
      <TopBarSocial onOpenDrawer={() => setDrawerOpen(true)} isAuthenticated={isAuthenticated} />

      <section className="searchPageContent" aria-label="Tela de busca">
        <div className="searchScreenHeader">
          <div className="searchFieldWrap">
            <SearchIcon />
            <input
              className="search searchInputScreen"
              placeholder={placeholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={activeTab === "shows" ? "Buscar shows" : "Buscar amigos"}
              autoFocus
            />
          </div>
          <Link
            href="/"
            className="iconBtn"
            aria-label="Fechar busca"
            onClick={() => {
              trackEvent("search_close_click", { source: "search_page" });
            }}
          >
            <CloseIcon />
          </Link>
        </div>

        <div className="tabsBar searchTabsBar" role="tablist" aria-label="Tipo de busca">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "shows"}
            className={`tab ${activeTab === "shows" ? "isActive" : ""}`}
            onClick={() => changeTab("shows")}
          >
            Shows
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "amigos"}
            className={`tab ${activeTab === "amigos" ? "isActive" : ""}`}
            onClick={() => changeTab("amigos")}
          >
            Amigos
          </button>
        </div>

        <div className="searchMetaBar">
          <span className="muted">{hint}</span>
        </div>

        {activeTab === "shows" ? (
          <div key="tab-shows" className="tabPanel">
            {normalizedQuery.length < 2 ? (
              <p className="emptyBox">
                Por onde você começa? <br />
                <strong>guns n&apos; roses</strong> <br />
                <strong>iron maiden curitiba 2019</strong> <br />
                <strong>foo fighters lollapalooza</strong> <br />
                <strong>guns n&apos; roses são paulo 2022</strong>
              </p>
            ) : searchLoading ? (
              <p className="emptyBox">Procurando shows...</p>
            ) : searchError ? (
              <p className="emptyBox errorBox">{searchError}</p>
            ) : searchResults.length ? (
              <div className="resultList">
                {searchResults.map((show) => (
                  <SearchResultRow
                    key={show.id}
                    show={show}
                    onOpenDetail={(s) => {
                      trackEvent("show_detail_open", { source: "search_results", show_id: s.id });
                      openShowOverlay(s);
                    }}
                  />
                ))}
                {searchLoadingMore ? <p className="emptyBox">Carregando mais...</p> : null}
                {!searchLoadingMore && searchMeta.hasMore ? <div ref={searchSentinelRef} className="searchSentinel" aria-hidden /> : null}
                {!searchMeta.hasMore && searchResults.length > 0 ? (
                  <p className="muted">
                    Isso é tudo — {searchMeta.total} {searchMeta.total === 1 ? "show encontrado" : "shows encontrados"}.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="emptyBox">
                Nenhum show encontrado.
                <br />
                Tente só o artista (ex.: <strong>iron maiden</strong>) ou acrescente cidade e ano (ex.: <strong>iron maiden curitiba 2019</strong>).
              </p>
            )}
          </div>
        ) : (
          <div key="tab-amigos" className="tabPanel">
            {!isAuthenticated ? (
              <p className="emptyBox">
                <Link href="/signin" className="footerLink">
                  Entre para encontrar amigos
                </Link>{" "}
                que também guardam memórias de shows.
              </p>
            ) : normalizedQuery.length < 2 ? (
              <p className="emptyBox">
                Procure por quem também esteve nos shows que você amou.
                <br />
                Digita um nome — pode ser parte dele.
              </p>
            ) : friendLoading ? (
              <p className="emptyBox">Buscando pessoas...</p>
            ) : friendError ? (
              <p className="emptyBox errorBox">{friendError}</p>
            ) : friendResults.length ? (
              <div className="resultList">
                {friendResults.map((result) => (
                  <FriendResultRow key={result.userId} result={result} isAuthenticated={isAuthenticated} />
                ))}
              </div>
            ) : (
              <p className="emptyBox">
                Ninguém encontrado com esse nome ainda.
                <br />
                Tenta um apelido ou parte do nome.
              </p>
            )}
          </div>
        )}
      </section>

      <SocialDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} source="search" />

      {selectedShow ? (
        <ShowDetailClient
          id={selectedShow.id}
          mode="overlay"
          onClose={closeShowOverlay}
          isAuthenticated={isAuthenticated}
          viewer={viewer ? ({ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } satisfies Viewer) : null}
          initialData={selectedShow.initialData ? ({ ...selectedShow.initialData, songNames: [], setlistSections: [] } satisfies ShowDetailRecord) : undefined}
        />
      ) : null}
    </main>
  );
}

async function fetchSearchPage(queryValue: string, page: number) {
  const response = await fetch(`/api/setlists/search?searchTerm=${encodeURIComponent(queryValue)}&p=${page}`);
  const payload = (await response.json()) as SearchResponse | { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload && "message" in payload ? payload.message ?? payload.error ?? "Não conseguimos buscar os shows agora." : "Não conseguimos buscar os shows agora.");
  }
  return payload as SearchResponse;
}

function computeSearchMeta(payload: SearchResponse): SearchStateMeta {
  const pageOneBased = payload.page ?? 1;
  const itemsPerPage = payload.itemsPerPage && payload.itemsPerPage > 0 ? payload.itemsPerPage : payload.shows.length ?? 0;
  const total = payload.total ?? payload.shows.length ?? 0;
  const loadedCount = itemsPerPage > 0 ? pageOneBased * itemsPerPage : payload.shows.length;
  return {
    pageLoaded: Math.max(0, pageOneBased - 1),
    hasMore: loadedCount < total,
    total
  };
}

function normalizeForMatch(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYearToken(query: string) {
  const match = /(?:^|\s)(19\d{2}|20\d{2})(?:\s|$)/.exec(query);
  return match?.[1] ?? "";
}

function detectCountryHints(query: string) {
  const q = normalizeForMatch(query);
  const hints = new Set<string>();
  const map: Array<[string, string]> = [
    ["brasil", "br"],
    ["brazil", "br"],
    ["usa", "us"],
    ["eua", "us"],
    ["united states", "us"],
    ["canada", "ca"],
    ["mexico", "mx"],
    ["argentina", "ar"],
    ["chile", "cl"],
    ["uk", "gb"],
    ["united kingdom", "gb"],
    ["inglaterra", "gb"],
    ["england", "gb"]
  ];
  for (const [phrase, code] of map) {
    if (q.includes(phrase)) hints.add(code);
  }
  return hints;
}

function scoreShowForQuery(query: string, show: ShowRecord) {
  const qNorm = normalizeForMatch(query);
  const artistNorm = normalizeForMatch(show.artist);
  const cityNorm = normalizeForMatch(show.city);
  const countryNorm = normalizeForMatch(show.country);
  const venueNorm = normalizeForMatch(show.venue);
  const fullNorm = `${artistNorm} ${cityNorm} ${countryNorm} ${venueNorm}`;
  const tokens = qNorm.split(" ").filter((t) => t.length >= 2);
  const yearHint = extractYearToken(qNorm);
  const countryHints = detectCountryHints(qNorm);

  let score = 0;
  if (artistNorm === qNorm) score += 120;
  if (artistNorm.startsWith(qNorm)) score += 80;
  if (artistNorm.includes(qNorm)) score += 55;
  for (const token of tokens) {
    if (artistNorm.includes(token)) score += 16;
    if (cityNorm.includes(token)) score += 11;
    if (countryNorm.includes(token)) score += 8;
    if (venueNorm.includes(token)) score += 5;
  }
  const allTokensMatch = tokens.length > 0 && tokens.every((token) => fullNorm.includes(token));
  if (allTokensMatch) score += 22;
  if (yearHint && show.eventDateIso.startsWith(yearHint)) score += 25;
  if (countryHints.size > 0) {
    const showCountryCode = countryNorm.slice(0, 2);
    if ([...countryHints].some((hint) => showCountryCode === hint || countryNorm.includes(hint))) score += 18;
  }
  return score;
}

function rankSearchResults(query: string, shows: ShowRecord[]) {
  const todayIso = new Date().toISOString().split("T")[0] ?? "";
  return [...shows].sort((a, b) => {
    const aFuture = a.eventDateIso >= todayIso;
    const bFuture = b.eventDateIso >= todayIso;

    if (aFuture !== bFuture) return aFuture ? -1 : 1;

    if (a.eventDateIso !== b.eventDateIso) {
      return aFuture
        ? a.eventDateIso < b.eventDateIso ? -1 : 1
        : a.eventDateIso < b.eventDateIso ? 1 : -1;
    }

    const scoreDiff = scoreShowForQuery(query, b) - scoreShowForQuery(query, a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.artist.localeCompare(b.artist);
  });
}

function logNoResultSearch(queryValue: string, loggedRef: MutableRefObject<string>) {
  const normalized = normalizeForMatch(queryValue);
  if (!normalized) return;
  if (loggedRef.current === normalized) return;

  try {
    const raw = window.localStorage.getItem(NO_RESULT_ANALYTICS_KEY);
    const current = raw ? (JSON.parse(raw) as Array<{ q: string; count: number; lastAt: string }>) : [];
    const next = [...current];
    const idx = next.findIndex((item) => item.q === normalized);
    if (idx >= 0) {
      next[idx] = { q: normalized, count: (next[idx].count ?? 0) + 1, lastAt: new Date().toISOString() };
    } else {
      next.unshift({ q: normalized, count: 1, lastAt: new Date().toISOString() });
    }
    window.localStorage.setItem(NO_RESULT_ANALYTICS_KEY, JSON.stringify(next.slice(0, 50)));
    loggedRef.current = normalized;
  } catch {
    // ignore
  }
}
