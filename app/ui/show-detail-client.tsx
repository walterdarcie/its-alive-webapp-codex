"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ShowDetailRecord, ShowRecord } from "@/lib/show-types";
import { deriveWalletStatus, formatDatePtBrLong, formatVenueLine } from "@/lib/show-utils";
import { getWalletShow, isSavedInWallet, removeFromWallet, saveToWallet } from "@/lib/wallet-storage";

type ShowDetailClientProps = {
  id: string;
  mode?: "page" | "overlay";
  onClose?: () => void;
};

export function ShowDetailClient({ id, mode = "page", onClose }: ShowDetailClientProps) {
  const [show, setShow] = useState<ShowDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [ctaBurst, setCtaBurst] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);

  const isOverlay = mode === "overlay";

  useEffect(() => {
    setSaved(isSavedInWallet(id));
    setSetlistExpanded(false);

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

  useEffect(() => {
    if (!isOverlay) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOverlay]);

  const ctaLabel = useMemo(() => {
    if (!show) return "EU VOU";
    return deriveWalletStatus(show.eventDateIso) === "going" ? "EU VOU" : "EU FUI";
  }, [show]);

  const visibleSongs = show?.songNames.slice(0, 5) ?? [];
  const hiddenSongs = show?.songNames.slice(5) ?? [];

  function toggleWallet() {
    if (!show) return;
    if (isSavedInWallet(show.id)) {
      removeFromWallet(show.id);
      setSaved(false);
    } else {
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
    setCtaBurst(false);
    window.setTimeout(() => setCtaBurst(true), 0);
    window.setTimeout(() => setCtaBurst(false), 550);
  }

  function requestClose() {
    if (onClose) {
      onClose();
      return;
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isOverlay) return;
    const target = event.target as HTMLElement | null;
    const inDragHandle = Boolean(target?.closest(".detailSheetTop")) || Boolean(target?.closest(".detailTopNotch"));
    if (!inDragHandle) return;
    dragStartY.current = event.clientY;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isOverlay) return;
    if (dragStartY.current == null) return;
    const delta = Math.max(0, event.clientY - dragStartY.current);
    setDragOffset(delta);
  }

  function endDrag(pointerId?: number, currentTarget?: HTMLElement | null) {
    if (pointerId != null && currentTarget?.hasPointerCapture(pointerId)) {
      currentTarget.releasePointerCapture(pointerId);
    }
    setIsDragging(false);
    if (dragOffset > 140) {
      setDragOffset(0);
      requestClose();
      return;
    }
    setDragOffset(0);
    dragStartY.current = null;
  }

  const sheetStyle =
    isOverlay && (dragOffset > 0 || isDragging)
      ? {
          transform: `translateY(${dragOffset}px) scale(${1 - Math.min(dragOffset / 2000, 0.03)})`
        }
      : undefined;

  const content = show ? (
    <section
      className={`detailSheet ${isOverlay ? "detailSheetOverlay" : ""} ${isDragging ? "isDragging" : ""}`}
      aria-label="Detalhes do show"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endDrag(e.pointerId, e.currentTarget)}
      onPointerCancel={(e) => endDrag(e.pointerId, e.currentTarget)}
      style={sheetStyle}
    >
      <div className="detailSheetTop">
        <div className="detailTopNotch" aria-hidden />
        <div className="detailHeaderBar">
          <Image src="/brand/logo-icon.svg" alt="" width={28} height={28} className="detailMiniBrand" aria-hidden />
          {isOverlay ? (
            <button type="button" className="iconBtn iconBtnCentered" onClick={requestClose} aria-label="Fechar detalhes">
              <CloseIcon />
            </button>
          ) : (
            <Link href="/" className="iconBtn iconBtnCentered" aria-label="Fechar detalhes">
              <CloseIcon />
            </Link>
          )}
        </div>

        <p className="ticketDate detailDateTop">{formatDatePtBrLong(show.eventDateIso)}</p>
        <h1 className="detailTitle">{show.artist}</h1>
        <p className="ticketVenue detailVenue venueWithPin">{formatVenueLine(show)}</p>
      </div>

      <div className="detailHero cardImage">Imagem do show (placeholder)</div>

      <div className="detailBody detailBodyTicket">
        {show.tourName ? <p className="resultMeta detailTour">Turnê: {show.tourName}</p> : null}

        <div className="detailActions">
          <button
            type="button"
            className={`ctaMain ${saved ? "isActive" : ""} ${ctaBurst ? "ctaBurst" : ""}`}
            onClick={toggleWallet}
            aria-pressed={saved}
          >
            <span className="ctaMainLabel">{ctaLabel}!</span>
            <span className="ctaMainPulse" aria-hidden />
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
            <>
              <ol className="songList">
                {visibleSongs.map((song, index) => (
                  <li key={`${song}-${index}`}>{song}</li>
                ))}
              </ol>

              {hiddenSongs.length > 0 ? (
                <div className={`setlistAccordion ${setlistExpanded ? "isOpen" : ""}`}>
                  <button
                    type="button"
                    className="setlistExpandBtn"
                    onClick={() => setSetlistExpanded((v) => !v)}
                    aria-expanded={setlistExpanded}
                  >
                    {setlistExpanded ? "RECOLHER SETLIST" : "SETLIST COMPLETA"}
                  </button>
                  <div className="setlistAccordionBody" aria-hidden={!setlistExpanded}>
                    <ol className="songList songListExtra" start={6}>
                      {hiddenSongs.map((song, index) => (
                        <li key={`${song}-extra-${index}`}>{song}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : null}
            </>
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
  );

  if (isOverlay) {
    return (
      <div className="detailOverlayRoot" role="dialog" aria-modal="true" aria-label="Detalhes do show">
        <button type="button" className="detailBackdrop" aria-label="Fechar detalhes" onClick={requestClose} />
        <div className="detailOverlayContainer">{content}</div>
      </div>
    );
  }

  return <main className="page detailPage">{content}</main>;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="iconSvg">
      <path
        d="m18.3 5.71-1.41-1.42L12 9.17 7.11 4.29 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.41L12 12l4.89 4.9 1.41-1.41-4.89-4.89 4.89-4.89Z"
        fill="currentColor"
      />
    </svg>
  );
}
