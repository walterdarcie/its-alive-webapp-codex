"use client";

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
      <div className="brand">
        <span>it&apos;s</span>
        <span className="brandTicket">alive</span>
      </div>
      <div className="avatarStub" aria-hidden />
    </header>
  );
}

function EventCard({ show }: { show: ShowRecord }) {
  const daysAway = daysUntilShow(show.eventDateIso);
  const dateLabel = formatDatePtBrLong(show.eventDateIso);
  return (
    <article className="card">
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
    <article className="ticket">
      <div className="ticketThumb">Foto</div>
      <div className="ticketBody">
        <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
        <h3 className="ticketName">{show.artist}</h3>
        <p className="ticketVenue">{formatVenueLine(show)}</p>
      </div>
      <div className="ticketAction ticketActionStack">
        <Link className="chip chipGhost" href={`/show/${show.id}`}>
          DETALHES
        </Link>
        <button type="button" className="chip" onClick={() => onToggle(show)}>
          {status === "going" ? "DESMARCAR EU VOU" : "DESMARCAR EU FUI"}
        </button>
      </div>
    </article>
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
    <article className="resultRow">
      <div className="resultBody">
        <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
        <h3 className="resultTitle">{show.artist}</h3>
        <p className="ticketVenue">{formatVenueLine(show)}</p>
        {show.tourName ? <p className="resultMeta">Turnê: {show.tourName}</p> : null}
      </div>

      <div className="resultActions">
        <Link className="chip chipGhost" href={`/show/${show.id}`}>
          VER
        </Link>
        <button type="button" className="chip" onClick={() => onToggleWallet(show)}>
          {saved ? "DESMARCAR" : status === "going" ? "EU VOU!" : "EU FUI!"}
        </button>
      </div>
    </article>
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

      <input
        className="search"
        placeholder="Encontre shows incríveis"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar shows"
      />

      <section className="section" aria-labelledby="busca-shows">
        <div className="sectionHeader">
          <h2 id="busca-shows" className="sectionTitle sectionTitleSmall">
            Buscar shows
          </h2>
          <span className="muted">Mín. 2 caracteres • debounce • cache no servidor</span>
        </div>

        {normalizedQuery.length < 2 ? (
          <p className="emptyBox">Digite artista, cidade e opcionalmente ano. Ex.: `metallica são paulo 2022`.</p>
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

      <section className="section" aria-labelledby="shows-futuros">
        <h2 id="shows-futuros" className="sectionTitle">
          Eu vou!
        </h2>
        {futureShows.length ? (
          <div className="slider">
            {futureShows.map((show) => (
              <Link key={show.id} href={`/show/${show.id}`}>
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
    </main>
  );
}
