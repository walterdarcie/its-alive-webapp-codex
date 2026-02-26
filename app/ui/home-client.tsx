"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ShowRecord } from "@/lib/show-types";
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
        <div className="cardVenue">{formatVenueLine(show)}</div>
      </div>
    </article>
  );
}

function TicketRow({
  show,
  onToggle
}: {
  show: ShowRecord;
  onToggle: (show: ShowRecord) => void;
}) {
  const status = deriveWalletStatus(show.eventDateIso);
  return (
    <div className="ticketWrap">
      <Link className="ticket ticketClickable" href={`/show/${show.id}`}>
        <div className="ticketThumb">Foto</div>
        <div className="ticketBody">
          <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
          <h3 className="ticketName">{show.artist}</h3>
          <p className="ticketVenue">{formatVenueLine(show)}</p>
        </div>
      </Link>
      <button type="button" className="ticketTextAction" onClick={() => onToggle(show)}>
        {status === "going" ? "Desmarcar eu vou" : "Desmarcar eu fui"}
      </button>
    </div>
  );
}

function SearchResultRow({
  show,
  onToggleWallet
}: {
  show: ShowRecord;
  onToggleWallet: (show: ShowRecord) => void;
}) {
  const saved = isSavedInWallet(show.id);
  const status = deriveWalletStatus(show.eventDateIso);

  return (
    <div className="resultRow">
      <Link className="resultBodyLink" href={`/show/${show.id}`}>
        <div className="resultBody">
          <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
          <h3 className="resultTitle">{show.artist}</h3>
          <p className="ticketVenue">{formatVenueLine(show)}</p>
          {show.tourName ? <p className="resultMeta">Turnê: {show.tourName}</p> : null}
        </div>
      </Link>

      <div className="resultActions">
        <button type="button" className="chip" onClick={() => onToggleWallet(show)}>
          {saved ? "DESMARCAR" : status === "going" ? "EU VOU!" : "EU FUI!"}
        </button>
      </div>
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

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
    const q = normalizedQuery;
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/setlists/search?searchTerm=${encodeURIComponent(q)}&p=0`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as SearchResponse | { error?: string; message?: string };

        if (!response.ok) {
          throw new Error(payload && "message" in payload ? payload.message ?? payload.error ?? "Erro na busca" : "Erro na busca");
        }

        startTransition(() => {
          setSearchResults((payload as SearchResponse).shows ?? []);
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Falha ao buscar shows");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [normalizedQuery]);

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
              <Link key={show.id} href={`/show/${show.id}`} className="cardLink">
                <EventCard show={show} />
              </Link>
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
              <TicketRow key={show.id} show={show} onToggle={toggleWallet} />
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
        <section className="searchScreen" aria-label="Tela de busca">
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
            <span className="muted">Digite artista, cidade e opcionalmente ano</span>
            <span className="muted">Cache + debounce</span>
          </div>

          {normalizedQuery.length < 2 ? (
            <p className="emptyBox">Ex.: metallica são paulo 2022</p>
          ) : searchLoading ? (
            <p className="emptyBox">Buscando shows...</p>
          ) : searchError ? (
            <p className="emptyBox errorBox">{searchError}</p>
          ) : searchResults.length ? (
            <div className="resultList">
              {searchResults.map((show) => (
                <SearchResultRow key={show.id} show={show} onToggleWallet={toggleWallet} />
              ))}
            </div>
          ) : (
            <p className="emptyBox">Nenhum resultado encontrado.</p>
          )}
        </section>
      ) : null}
    </main>
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
