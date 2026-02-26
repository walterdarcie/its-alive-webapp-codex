"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ShowRecord } from "@/lib/show-types";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { getWalletEntries, type WalletEntry } from "@/lib/wallet-storage";
import { daysUntilShow, formatDatePtBrLong, formatVenueLine, isFutureOrTodayShow } from "@/lib/show-utils";

function BrandHeader() {
  return (
    <header className="topbar">
      <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
      <div className="avatarStub" aria-hidden />
    </header>
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

function TicketRow({ show, onOpenDetail }: { show: ShowRecord; onOpenDetail: (showId: string) => void }) {
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

function splitWallet(entries: WalletEntry[]) {
  const shows = entries.map((entry) => entry.show);
  return {
    futureShows: shows.filter((show) => isFutureOrTodayShow(show.eventDateIso)),
    pastShows: shows.filter((show) => !isFutureOrTodayShow(show.eventDateIso))
  };
}

export function HomeClient() {
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);

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

  const { futureShows, pastShows } = useMemo(() => splitWallet(walletEntries), [walletEntries]);

  return (
    <main className="page">
      <BrandHeader />

      <Link href="/search" className="search searchButton searchNavButton">
        <SearchIcon />
        <span>Encontre shows incríveis</span>
      </Link>

      <section className="section" aria-labelledby="shows-futuros">
        <h2 id="shows-futuros" className="sectionTitle">
          Eu vou!
        </h2>
        {futureShows.length ? (
          <div className="slider">
            {futureShows.map((show) => (
              <button key={show.id} type="button" className="cardLink cardButtonReset" onClick={() => setSelectedShowId(show.id)}>
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
              <TicketRow key={show.id} show={show} onOpenDetail={setSelectedShowId} />
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum show passado marcado na carteira.</p>
        )}
      </section>

      <p className="footerHint">
        MVP sem login: a carteira fica salva neste dispositivo. Na próxima fase, sincronizamos com Supabase + login Google.
      </p>

      {selectedShowId ? <ShowDetailClient id={selectedShowId} mode="overlay" onClose={() => setSelectedShowId(null)} /> : null}
    </main>
  );
}
