"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ShowDetailRecord, ShowRecord, Viewer } from "@/lib/show-types";
import { deriveWalletStatus, formatDatePtBrLong, formatVenueLine, isFutureOrTodayShow } from "@/lib/show-utils";
import { fetchArtistImageClient } from "@/lib/artist-image-client";
import { getWalletShow, isSavedInWallet, removeFromWalletServer, saveToWalletServer } from "@/lib/wallet-storage";
import { trackEvent } from "@/lib/analytics";
import { ShowFeedClient } from "@/app/ui/show-feed-client";

type ShowDetailClientProps = {
  id: string;
  mode?: "page" | "overlay";
  onClose?: () => void;
  initialData?: ShowDetailRecord | null;
  isAuthenticated?: boolean;
  viewer?: Viewer | null;
};

function buildDetailPhotoStyle(imageUrl: string): CSSProperties {
  const sanitized = imageUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return {
    backgroundImage: `linear-gradient(180deg, rgba(7, 14, 30, 0.2), rgba(7, 14, 30, 0.52)), url("${sanitized}")`,
    backgroundPosition: "center",
    backgroundSize: "cover"
  };
}

export function ShowDetailClient({ id, mode = "page", onClose, initialData, isAuthenticated = true, viewer = null }: ShowDetailClientProps) {
  const [show, setShow] = useState<ShowDetailRecord | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [ctaBurst, setCtaBurst] = useState(false);
  const [artistImageUrl, setArtistImageUrl] = useState<string | null>(initialData?.artistImageUrl ?? null);
  const [savingWallet, setSavingWallet] = useState(false);
  const [lastSyncFailed, setLastSyncFailed] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragOriginScrollTop = useRef(0);

  const isOverlay = mode === "overlay";

  useEffect(() => {
    setSaved(isSavedInWallet(id));
    setSetlistExpanded(false);
    setIsClosing(false);
    setLastSyncFailed(false);

    const walletShow = getWalletShow(id);
    if (!initialData) {
      setArtistImageUrl(walletShow?.artistImageUrl ?? null);
    }
    if (walletShow) {
      setShow((prev) => ({
        ...(prev ?? { ...walletShow, songNames: [], setlistSections: [] }),
        ...walletShow
      }));
    }

    // Skip client fetch if we already have server-side data
    if (initialData) {
      setLoading(false);
      return;
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
        const detailPayload = payload as ShowDetailRecord;
        setShow(detailPayload);
        setArtistImageUrl(detailPayload.artistImageUrl ?? walletShow?.artistImageUrl ?? null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!walletShow) setError(err instanceof Error ? err.message : "Falha ao carregar show");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [id, initialData]);

  useEffect(() => {
    const currentShow = show;
    if (!currentShow) return;

    if (currentShow.artistImageUrl) {
      setArtistImageUrl(currentShow.artistImageUrl);
      return;
    }

    const showId = currentShow.id;
    const artistName = currentShow.artist;
    const artistMbid = currentShow.artistMbid;
    let cancelled = false;

    async function loadImage() {
      const payload = await fetchArtistImageClient({
        artistName,
        artistMbid
      });
      if (cancelled || !payload.imageUrl) return;

      setArtistImageUrl(payload.imageUrl);
      setShow((current) => {
        if (!current || current.id !== showId) return current;
        return {
          ...current,
          artistImageUrl: payload.imageUrl ?? undefined,
          artistImagePageUrl: payload.pageUrl ?? undefined,
          artistImageSource: payload.source === "none" ? undefined : payload.source
        };
      });
    }

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [show?.id, show?.artist, show?.artistMbid, show?.artistImageUrl]);

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

  async function toggleWallet() {
    if (!show || savingWallet) return;

    if (!isAuthenticated) {
      const returnUrl = `/show/${encodeURIComponent(show.id)}`;
      window.location.href = `/signin?next=${encodeURIComponent(returnUrl)}`;
      return;
    }

    setSavingWallet(true);
    const isAlreadySaved = isSavedInWallet(show.id);

    try {
      if (isAlreadySaved) {
        const result = await removeFromWalletServer(show.id);
        trackEvent("wallet_unmark", { show_id: show.id, status_label: ctaLabel });
        setSaved(false);
        setLastSyncFailed(!result.synced);
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
          tourName: show.tourName,
          ticketUrl: show.ticketUrl,
          artistImageUrl: show.artistImageUrl ?? artistImageUrl ?? undefined,
          artistImagePageUrl: show.artistImagePageUrl,
          artistImageSource: show.artistImageSource
        };
        const result = await saveToWalletServer(walletRecord);
        trackEvent("wallet_mark", { show_id: show.id, status_label: ctaLabel });
        setSaved(true);
        setLastSyncFailed(!result.synced);
      }
    } finally {
      setSavingWallet(false);
      setCtaBurst(false);
      window.setTimeout(() => setCtaBurst(true), 0);
      window.setTimeout(() => setCtaBurst(false), 550);
    }
  }

  function requestClose() {
    if (isOverlay && onClose) {
      setIsClosing(true);
      window.setTimeout(() => {
        onClose();
      }, 220);
      return;
    }
    if (onClose) onClose();
  }

  function isMobileViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isOverlay) return;
    const target = event.target as HTMLElement | null;
    const isInteractive = Boolean(target?.closest("button, a, input, textarea, select"));
    if (isInteractive) return;
    const inDragHandle = Boolean(target?.closest(".detailHeaderBar")) || Boolean(target?.closest(".detailTopNotch"));
    if (!inDragHandle) return;

    const isMobile = isMobileViewport();
    if (isMobile && event.currentTarget.scrollTop > 0) return;

    dragStartY.current = event.clientY;
    dragOriginScrollTop.current = event.currentTarget.scrollTop;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isOverlay) return;
    if (dragStartY.current == null) return;
    if (dragOriginScrollTop.current > 0) return;
    const delta = Math.max(0, event.clientY - dragStartY.current);
    if (delta > 0) event.preventDefault();
    if (isMobileViewport() && delta > 84) {
      endDrag(event.pointerId, event.currentTarget, true);
      return;
    }
    setDragOffset(delta);
  }

  function endDrag(pointerId?: number, currentTarget?: HTMLElement | null, forceClose = false) {
    if (pointerId != null && currentTarget?.hasPointerCapture(pointerId)) {
      currentTarget.releasePointerCapture(pointerId);
    }
    setIsDragging(false);
    const closeThreshold = isMobileViewport() ? 96 : 140;
    if (forceClose || dragOffset > closeThreshold) {
      dragStartY.current = null;
      setDragOffset(0);
      requestClose();
      return;
    }
    setDragOffset(0);
    dragStartY.current = null;
  }

  const mobileDrag = isMobileViewport();
  const sheetStyle =
    isOverlay && (dragOffset > 0 || isDragging)
      ? {
          transform: mobileDrag ? `translateY(${dragOffset}px)` : `translateY(${dragOffset}px) scale(${1 - Math.min(dragOffset / 2000, 0.03)})`
        }
      : undefined;

  const content = show ? (
    <section
      className={`detailSheet ${isOverlay ? "detailSheetOverlay" : ""} ${isDragging ? "isDragging" : ""} ${isClosing ? "isClosing" : ""}`}
      aria-label="Detalhes do show"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endDrag(e.pointerId, e.currentTarget)}
      onPointerCancel={(e) => endDrag(e.pointerId, e.currentTarget)}
      style={sheetStyle}
    >
      <div className="detailSheetTop">
        <div className="detailHeaderBar">
          <div className="detailTopNotch" aria-hidden />
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
        <p className="ticketVenue detailVenue venueWithPin">
          <span className="venueText">{formatVenueLine(show)}</span>
        </p>
      </div>

      <div className={`detailHero cardImage ${artistImageUrl ? "hasPhoto" : ""}`} style={artistImageUrl ? buildDetailPhotoStyle(artistImageUrl) : undefined}>
        {artistImageUrl ? null : "Imagem do show (placeholder)"}
      </div>

      <div className="detailBody detailBodyTicket">
        {show.tourName ? <p className="resultMeta detailTour">Turnê: {show.tourName}</p> : null}

        <div className="detailActions">
          <button
            type="button"
            className={`ctaMain ${saved ? "isActive" : ""} ${ctaBurst ? "ctaBurst" : ""}`}
            onClick={() => {
              void toggleWallet();
            }}
            aria-pressed={saved}
            disabled={savingWallet}
          >
            <span className="ctaMainLabel">{savingWallet ? "SALVANDO..." : `${ctaLabel}!`}</span>
            <span className="ctaMainPulse" aria-hidden />
          </button>
          {show.ticketUrl && isFutureOrTodayShow(show.eventDateIso) ? (
            <a
              className="chip chipSecondary"
              href={show.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackEvent("ticket_buy_click", { show_id: show.id, source: "show_detail" });
              }}
            >
              INGRESSOS
            </a>
          ) : null}
          {show.setlistUrl && !show.id.startsWith("tm-") ? (
            <a
              className="chip chipGhost"
              href={show.setlistUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                trackEvent("setlistfm_external_click", { show_id: show.id });
              }}
            >
              SETLIST.FM
            </a>
          ) : null}
          {lastSyncFailed ? <p className="muted walletSyncHint">Salvo neste dispositivo. Sincroniza ao reconectar.</p> : null}
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
                  {!setlistExpanded ? (
                    <button
                      type="button"
                      className="setlistExpandBtn"
                      onClick={() =>
                        setSetlistExpanded((v) => {
                          const next = !v;
                          if (next) trackEvent("setlist_expand", { show_id: show.id });
                          return next;
                        })
                      }
                      aria-expanded={setlistExpanded}
                    >
                      SETLIST COMPLETA
                    </button>
                  ) : null}
                  <div className="setlistAccordionBody" aria-hidden={!setlistExpanded}>
                    <ol className="songList songListExtra" start={visibleSongs.length + 1}>
                      {hiddenSongs.map((song, index) => (
                        <li key={`${song}-extra-${index}`}>{song}</li>
                      ))}
                    </ol>
                  </div>
                  {setlistExpanded ? (
                    <button
                      type="button"
                      className="setlistExpandBtn"
                      onClick={() =>
                        setSetlistExpanded((v) => {
                          const next = !v;
                          if (!next) trackEvent("setlist_collapse", { show_id: show.id });
                          return next;
                        })
                      }
                      aria-expanded={setlistExpanded}
                    >
                      RECOLHER SETLIST
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">Setlist não disponível para este show.</p>
          )}
        </div>
      </div>

      <ShowFeedClient showId={id} viewer={viewer ?? null} />
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
