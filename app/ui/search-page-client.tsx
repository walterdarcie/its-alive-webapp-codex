"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import type { ShowRecord } from "@/lib/show-types";
import { formatVenueLine } from "@/lib/show-utils";
import type { ViewerProfile } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";

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

function BrandHeader({ viewer }: { viewer: ViewerProfile | null }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  async function signOut() {
    trackEvent("sign_out_click", { source: "search_header_menu" });
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <header className="topbar">
      <Link href="/" aria-label="Ir para a home" className="brandLogoLink">
        <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
      </Link>
      {viewer ? (
        <div className="profileMenuWrap" ref={menuRef}>
          <button
            type="button"
            className="avatarStub avatarButtonReset"
            aria-label={`Abrir menu da conta de ${viewer.name}`}
            aria-expanded={isMenuOpen}
            onClick={() =>
              setIsMenuOpen((v) => {
                const next = !v;
                if (next) trackEvent("profile_menu_open", { source: "search_header" });
                return next;
              })
            }
          >
            {viewer.avatarUrl ? (
              <span
                className="avatarPhoto"
                style={{
                  backgroundImage: `url("${viewer.avatarUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`
                }}
                aria-hidden
              />
            ) : (
              <span className="avatarFallbackIcon" aria-hidden />
            )}
          </button>

          {isMenuOpen ? (
            <div className="profileMenu" role="menu" aria-label="Menu da conta">
              <p className="profileMenuName">{viewer.name}</p>
              {viewer.email ? <p className="profileMenuEmail">{viewer.email}</p> : null}
              <p className="profileMenuHint">Conta sincronizada com Google + Supabase</p>
              <button
                type="button"
                className="chip chipGhost profileSignOutBtn"
                role="menuitem"
                onClick={() => {
                  void signOut();
                }}
              >
                Sair
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="profileMenuWrap">
          <Link href="/signin" className="avatarStub avatarButtonReset" aria-label="Fazer login" onClick={() => trackEvent("login_click", { source: "search_header" })}>
            <span className="avatarFallbackIcon" aria-hidden />
          </Link>
        </div>
      )}
    </header>
  );
}

function SearchResultRow({ show, onOpenDetail }: { show: ShowRecord; onOpenDetail: (showId: string) => void }) {
  const eventDate = new Date(`${show.eventDateIso}T00:00:00`);
  const ptBrMonthAbbr = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const month = ptBrMonthAbbr[eventDate.getMonth()] ?? "";
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(eventDate);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(eventDate);

  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset searchTicketDateLayout" onClick={() => onOpenDetail(show.id)}>
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
          {show.tourName ? <p className="resultMeta">Turnê: {show.tourName}</p> : null}
        </div>
      </button>
    </div>
  );
}

export function SearchPageClient({ viewer, isAuthenticated = true, initialQuery }: { viewer: ViewerProfile | null; isAuthenticated?: boolean; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const deferredQuery = useDeferredValue(query);
  const [searchResults, setSearchResults] = useState<ShowRecord[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchStateMeta>({
    pageLoaded: -1,
    hasMore: false,
    total: 0
  });
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);

  function openShowOverlay(showId: string) {
    setSelectedShowId(showId);
    window.history.pushState({ showOverlay: showId }, "", `/show/${encodeURIComponent(showId)}`);
  }

  function closeShowOverlay() {
    setSelectedShowId(null);
    window.history.pushState({}, "", "/search");
  }

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { showOverlay?: string } | null;
      if (state?.showOverlay) {
        setSelectedShowId(state.showOverlay);
      } else {
        setSelectedShowId(null);
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

  useEffect(() => {
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
        setSearchError(error instanceof Error ? error.message : "Falha ao buscar shows");
      } finally {
        if (!isCancelled) setSearchLoading(false);
      }
    }, 420);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery]);

  useEffect(() => {
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
  }, [normalizedQuery.length, searchLoading, searchLoadingMore, searchMeta]);

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
      setSearchError(error instanceof Error ? error.message : "Falha ao carregar mais resultados");
    } finally {
      setSearchLoadingMore(false);
    }
  }

  return (
    <main className="page searchPage">
      <BrandHeader viewer={viewer} />

      <section className="searchPageContent" aria-label="Tela de busca">
        <div className="searchScreenHeader">
          <div className="searchFieldWrap">
            <SearchIcon />
            <input
              className="search searchInputScreen"
              placeholder="Encontre shows incríveis"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Buscar shows"
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

        <div className="searchMetaBar">
          <span className="muted">Use: artista ou local, cidade, país, ano (vírgulas) para busca precisa</span>
        </div>

        {normalizedQuery.length < 2 ? (
          <p className="emptyBox">
            Exemplos: <br />
            <strong>guns n&apos; roses</strong> <br />
            <strong>guns n&apos; roses, são paulo, brasil, 2022</strong> <br />
            <strong>&quot;guns n&apos; roses&quot; em são paulo 2022</strong>
          </p>
        ) : searchLoading ? (
          <p className="emptyBox">Buscando shows...</p>
        ) : searchError ? (
          <p className="emptyBox errorBox">{searchError}</p>
        ) : searchResults.length ? (
          <div className="resultList">
            {searchResults.map((show) => (
              <SearchResultRow
                key={show.id}
                show={show}
                onOpenDetail={(showId) => {
                  trackEvent("show_detail_open", { source: "search_results", show_id: showId });
                  openShowOverlay(showId);
                }}
              />
            ))}
            {searchLoadingMore ? <p className="emptyBox">Carregando mais resultados...</p> : null}
            {!searchLoadingMore && searchMeta.hasMore ? <div ref={searchSentinelRef} className="searchSentinel" aria-hidden /> : null}
            {!searchMeta.hasMore && searchResults.length > 0 ? <p className="muted">Fim dos resultados ({searchMeta.total}).</p> : null}
          </div>
        ) : (
          <p className="emptyBox">
            Nenhum resultado encontrado para essa busca.
            <br />
            Tente: <strong>artista, cidade, país, ano</strong> (ex.: <strong>guns n&apos; roses, são paulo, brasil, 2022</strong>).
          </p>
        )}
      </section>

      {selectedShowId ? <ShowDetailClient id={selectedShowId} mode="overlay" onClose={closeShowOverlay} isAuthenticated={isAuthenticated} /> : null}
    </main>
  );
}

async function fetchSearchPage(queryValue: string, page: number) {
  const response = await fetch(`/api/setlists/search?searchTerm=${encodeURIComponent(queryValue)}&p=${page}`);
  const payload = (await response.json()) as SearchResponse | { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload && "message" in payload ? payload.message ?? payload.error ?? "Erro na busca" : "Erro na busca");
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
  return [...shows].sort((a, b) => {
    if (a.eventDateIso !== b.eventDateIso) return a.eventDateIso < b.eventDateIso ? 1 : -1;
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
