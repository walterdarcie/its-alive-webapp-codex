"use client";

import Image from "next/image";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ShowRecord } from "@/lib/show-types";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import {
  getWalletEntries,
  isSavedInWallet,
  removeFromWallet,
  saveToWallet,
  type WalletEntry
} from "@/lib/wallet-storage";
import {
  daysUntilShow,
  deriveWalletStatus,
  formatDatePtBrLong,
  formatVenueLine,
  isFutureOrTodayShow
} from "@/lib/show-utils";

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

function BrandHeader() {
  return (
    <header className="topbar">
      <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
      <div className="avatarStub" aria-hidden />
    </header>
  );
}

function EventCard({ show }: { show: ShowRecord }) {
  const daysAway = daysUntilShow(show.eventDateIso);
  const dateLabel = formatDatePtBrLong(show.eventDateIso);
  return (
    <article className="card">
      <div className="ticketTopNotch" aria-hidden />
      <div className="cardImage">{show.artist}</div>
      <div className="cardBody">
        <div className="cardMeta">
          {daysAway > 0 ? `Faltam ${daysAway} dias!` : daysAway === 0 ? "É hoje!" : dateLabel}
        </div>
        <h3 className="cardTitle">{show.artist}</h3>
        <div className="cardVenue venueWithPin">{formatVenueLine(show)}</div>
      </div>
    </article>
  );
}

function TicketRow({
  show,
  onOpenDetail
}: {
  show: ShowRecord;
  onOpenDetail: (showId: string) => void;
}) {
  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset" onClick={() => onOpenDetail(show.id)}>
        <div className="ticketThumb">Foto</div>
        <div className="ticketBody">
          <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
          <h3 className="ticketName">{show.artist}</h3>
          <p className="ticketVenue venueWithPin">{formatVenueLine(show)}</p>
        </div>
      </button>
    </div>
  );
}

function SearchResultRow({
  show,
  onOpenDetail
}: {
  show: ShowRecord;
  onOpenDetail: (showId: string) => void;
}) {
  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset searchTicketNoThumb" onClick={() => onOpenDetail(show.id)}>
        <div className="ticketBody ticketBodyNoThumb">
          <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
          <h3 className="ticketName">{show.artist}</h3>
          <p className="ticketVenue venueWithPin">{formatVenueLine(show)}</p>
          {show.tourName ? <p className="resultMeta">Turnê: {show.tourName}</p> : null}
        </div>
      </button>

    </div>
  );
}

function splitWallet(entries: WalletEntry[]) {
  const shows = entries.map((entry) => entry.show);
  return {
    futureShows: shows.filter((show) => isFutureOrTodayShow(show.eventDateIso)),
    pastShows: shows.filter((show) => !isFutureOrTodayShow(show.eventDateIso))
  };
}

export function HomeClient() {
  const [query, setQuery] = useState("");
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
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);
  const activeQueryRef = useRef("");
  const noResultLoggedRef = useRef<string>("");

  const normalizedQuery = deferredQuery.trim();

  useEffect(() => {
    setWalletEntries(getWalletEntries());
  }, []);

  useEffect(() => {
    function syncWallet() {
      setWalletEntries(getWalletEntries());
    }

    window.addEventListener("focus", syncWallet);
    window.addEventListener("storage", syncWallet);
    return () => {
      window.removeEventListener("focus", syncWallet);
      window.removeEventListener("storage", syncWallet);
    };
  }, []);

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

      try {
        const payload = await fetchSearchPage(q, 0);
        if (isCancelled || activeQueryRef.current !== q) return;

        const ranked = rankSearchResults(q, payload.shows ?? []);
        startTransition(() => {
          setSearchResults(ranked);
        });
        setSearchMeta(computeSearchMeta(payload));
        if (!ranked.length) {
          logNoResultSearch(q);
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
    }, 450);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery]);

  useEffect(() => {
    if (!searchOpen) return;
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
      {
        root: null,
        rootMargin: "160px 0px",
        threshold: 0.01
      }
    );

    observer.observe(searchSentinelRef.current);
    return () => observer.disconnect();
  }, [searchMeta, searchLoading, searchLoadingMore, searchOpen, normalizedQuery.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (selectedShowId) {
          setSelectedShowId(null);
          return;
        }
        if (searchOpen) setSearchOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, selectedShowId]);

  const { futureShows, pastShows } = useMemo(() => splitWallet(walletEntries), [walletEntries]);

  function refreshWallet() {
    setWalletEntries(getWalletEntries());
  }

  function toggleWallet(show: ShowRecord) {
    if (isSavedInWallet(show.id)) {
      removeFromWallet(show.id);
    } else {
      saveToWallet(show);
    }
    refreshWallet();
  }

  function openDetail(showId: string) {
    setSelectedShowId(showId);
  }

  async function fetchSearchPage(queryValue: string, page: number) {
    const response = await fetch(
      `/api/setlists/search?searchTerm=${encodeURIComponent(queryValue)}&p=${page}`
    );
    const payload = (await response.json()) as SearchResponse | { error?: string; message?: string };
    if (!response.ok) {
      throw new Error(
        payload && "message" in payload
          ? payload.message ?? payload.error ?? "Erro na busca"
          : "Erro na busca"
      );
    }
    return payload as SearchResponse;
  }

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
    } catch (error) {
      if (activeQueryRef.current !== queryValue) return;
      setSearchError(error instanceof Error ? error.message : "Falha ao carregar mais resultados");
    } finally {
      setSearchLoadingMore(false);
    }
  }

  function logNoResultSearch(queryValue: string) {
    const normalized = normalizeForMatch(queryValue);
    if (!normalized) return;
    if (noResultLoggedRef.current === normalized) return;

    try {
      const raw = window.localStorage.getItem(NO_RESULT_ANALYTICS_KEY);
      const current = raw ? (JSON.parse(raw) as Array<{ q: string; count: number; lastAt: string }>) : [];
      const next = [...current];
      const idx = next.findIndex((item) => item.q === normalized);
      if (idx >= 0) {
        next[idx] = {
          q: normalized,
          count: (next[idx].count ?? 0) + 1,
          lastAt: new Date().toISOString()
        };
      } else {
        next.unshift({ q: normalized, count: 1, lastAt: new Date().toISOString() });
      }
      window.localStorage.setItem(NO_RESULT_ANALYTICS_KEY, JSON.stringify(next.slice(0, 50)));
      noResultLoggedRef.current = normalized;
    } catch {
      // Ignore local analytics failures.
    }
  }

  return (
    <main className="page">
      <BrandHeader />

      <button type="button" className="search searchButton" onClick={() => setSearchOpen(true)}>
        <SearchIcon />
        <span>Encontre shows incríveis</span>
      </button>

      <section className="section" aria-labelledby="shows-futuros">
        <h2 id="shows-futuros" className="sectionTitle">
          Eu vou!
        </h2>
        {futureShows.length ? (
          <div className="slider">
            {futureShows.map((show) => (
              <button key={show.id} type="button" className="cardLink cardButtonReset" onClick={() => openDetail(show.id)}>
                <EventCard show={show} />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum show futuro marcado na sua carteira ainda.</p>
        )}
      </section>

      <section className="section" aria-labelledby="shows-passados">
        <h2 id="shows-passados" className="sectionTitle">
          Eu fui!
        </h2>
        {pastShows.length ? (
          <div className="ticketList">
            {pastShows.map((show) => (
              <TicketRow key={show.id} show={show} onOpenDetail={openDetail} />
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum show passado marcado na carteira.</p>
        )}
      </section>

      <p className="footerHint">
        MVP sem login: a carteira fica salva neste dispositivo. Na próxima fase, sincronizamos com Supabase + login Google.
      </p>

      {searchOpen ? (
        <section className="searchScreen searchScreenPage" aria-label="Tela de busca">
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
            <button type="button" className="iconBtn" onClick={() => setSearchOpen(false)} aria-label="Fechar busca">
              <CloseIcon />
            </button>
          </div>

          <div className="searchMetaBar">
            <span className="muted">Use: artista, cidade, país, ano (vírgulas) para busca precisa</span>
            <span className="muted">Scroll infinito • cache • debounce</span>
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
                <SearchResultRow key={show.id} show={show} onOpenDetail={openDetail} />
              ))}
              {searchLoadingMore ? <p className="emptyBox">Carregando mais resultados...</p> : null}
              {!searchLoadingMore && searchMeta.hasMore ? (
                <div ref={searchSentinelRef} className="searchSentinel" aria-hidden />
              ) : null}
              {!searchMeta.hasMore && searchResults.length > 0 ? (
                <p className="muted">Fim dos resultados ({searchMeta.total}).</p>
              ) : null}
            </div>
          ) : (
            <p className="emptyBox">
              Nenhum resultado encontrado para essa busca.
              <br />
              Tente: <strong>artista, cidade, país, ano</strong> (ex.: <strong>guns n&apos; roses, são paulo, brasil, 2022</strong>).
            </p>
          )}
        </section>
      ) : null}

      {selectedShowId ? (
        <ShowDetailClient id={selectedShowId} mode="overlay" onClose={() => setSelectedShowId(null)} />
      ) : null}
    </main>
  );
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
    if ([...countryHints].some((hint) => showCountryCode === hint || countryNorm.includes(hint))) {
      score += 18;
    }
  }

  return score;
}

function rankSearchResults(query: string, shows: ShowRecord[]) {
  return [...shows].sort((a, b) => {
    const scoreDiff = scoreShowForQuery(query, b) - scoreShowForQuery(query, a);
    if (scoreDiff !== 0) return scoreDiff;

    // Tie-breaker: newer shows first.
    if (a.eventDateIso === b.eventDateIso) return a.artist.localeCompare(b.artist);
    return a.eventDateIso < b.eventDateIso ? 1 : -1;
  });
}


function computeSearchMeta(payload: SearchResponse): SearchStateMeta {
  const pageOneBased = payload.page ?? 1;
  const itemsPerPage = payload.itemsPerPage ?? payload.shows.length ?? 0;
  const total = payload.total ?? payload.shows.length ?? 0;
  const loadedCount = pageOneBased * itemsPerPage;

  return {
    pageLoaded: Math.max(0, pageOneBased - 1),
    hasMore: loadedCount < total,
    total
  };
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
