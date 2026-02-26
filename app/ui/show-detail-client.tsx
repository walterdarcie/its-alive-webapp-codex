"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShowDetailRecord, ShowRecord } from "@/lib/show-types";
import { formatDatePtBrLong, formatVenueLine } from "@/lib/show-utils";
import { getWalletShow, isSavedInWallet, removeFromWallet, saveToWallet } from "@/lib/wallet-storage";

export function ShowDetailClient({ id }: { id: string }) {
  const [show, setShow] = useState<ShowDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isSavedInWallet(id));

    const walletShow = getWalletShow(id);
    if (walletShow) {
      setShow((prev) => ({
        ...(prev ?? { ...walletShow, songNames: [] }),
        ...walletShow
      }));
    }

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/setlists/${encodeURIComponent(id)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as ShowDetailRecord | { message?: string; error?: string };
        if (!response.ok) {
          throw new Error("message" in payload ? payload.message ?? payload.error ?? "Falha ao carregar show" : "Falha ao carregar show");
        }
        setShow(payload as ShowDetailRecord);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!walletShow) setError(err instanceof Error ? err.message : "Falha ao carregar show");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [id]);

  function toggleWallet() {
    if (!show) return;
    if (isSavedInWallet(show.id)) {
      removeFromWallet(show.id);
      setSaved(false);
      return;
    }

    const walletRecord: ShowRecord = {
      id: show.id,
      artist: show.artist,
      venue: show.venue,
      city: show.city,
      country: show.country,
      eventDateIso: show.eventDateIso,
      setlistUrl: show.setlistUrl,
      artistMbid: show.artistMbid,
      venueMbid: show.venueMbid,
      tourName: show.tourName
    };
    saveToWallet(walletRecord);
    setSaved(true);
  }

  return (
    <main className="page detailPage">
      {show ? (
        <section className="detailSheet" aria-label="Detalhes do show">
          <div className="detailSheetTop">
            <div className="detailTopNotch" aria-hidden />
            <div className="detailHeaderBar">
              <Image src="/brand/logo-icon.svg" alt="" width={28} height={28} className="detailMiniBrand" aria-hidden />
              <Link href="/" className="iconBtn" aria-label="Fechar detalhes">
                <CloseIcon />
              </Link>
            </div>

            <p className="ticketDate detailDateTop">{formatDatePtBrLong(show.eventDateIso)}</p>
            <h1 className="detailTitle">{show.artist}</h1>
            <p className="ticketVenue detailVenue">{formatVenueLine(show)}</p>
          </div>

          <div className="detailHero cardImage">Imagem do show (placeholder)</div>

          <div className="detailBody detailBodyTicket">
            <div className="ticketSideCut ticketSideCutLeft" aria-hidden />
            <div className="ticketSideCut ticketSideCutRight" aria-hidden />

            {show.tourName ? <p className="resultMeta detailTour">Turnê: {show.tourName}</p> : null}

            <div className="detailActions">
              <button type="button" className="chip" onClick={toggleWallet}>
                {saved ? "DESMARCAR" : "EU FUI / EU VOU"}
              </button>
              {show.setlistUrl ? (
                <a className="chip chipGhost" href={show.setlistUrl} target="_blank" rel="noreferrer">
                  SETLIST.FM
                </a>
              ) : null}
            </div>

            <div className="setlistPanel">
              <h2 className="setlistTitle">Setlist</h2>
              {loading && !show.songNames.length ? (
                <p className="muted">Carregando setlist...</p>
              ) : show.songNames.length ? (
                <ol className="songList">
                  {show.songNames.slice(0, 12).map((song, index) => (
                    <li key={`${song}-${index}`}>{song}</li>
                  ))}
                </ol>
              ) : (
                <p className="muted">Setlist não disponível para este show.</p>
              )}
            </div>
          </div>
        </section>
      ) : loading ? (
        <p className="emptyBox">Carregando show...</p>
      ) : (
        <p className="emptyBox errorBox">{error ?? "Show não encontrado."}</p>
      )}
    </main>
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
