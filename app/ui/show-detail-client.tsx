"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ShowDetailRecord, ShowRecord, Viewer } from "@/lib/show-types";
import { deriveWalletStatus, formatVenueLine, isFutureOrTodayShow } from "@/lib/show-utils";
import { fetchArtistImageClient } from "@/lib/artist-image-client";
import { getWalletShow, isSavedInWallet, removeFromWalletServer, saveToWalletServer } from "@/lib/wallet-storage";
import { useLocale } from "@/lib/i18n-context";
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


export function ShowDetailClient({ id, mode = "page", onClose, initialData, isAuthenticated = true, viewer = null }: ShowDetailClientProps) {
  const { t, formatDate } = useLocale();
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
  const [shareConfirm, setShareConfirm] = useState<"idle" | "copied">("idle");
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
          throw new Error("message" in payload ? payload.message ?? payload.error ?? t.showDetail.errorLoading : t.showDetail.errorLoading);
        }
        const detailPayload = payload as ShowDetailRecord;
        setShow(detailPayload);
        setArtistImageUrl(detailPayload.artistImageUrl ?? walletShow?.artistImageUrl ?? null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!walletShow) setError(err instanceof Error ? err.message : t.showDetail.errorLoading);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [id, initialData]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!show) return t.showDetail.ctaGoing;
    return deriveWalletStatus(show.eventDateIso) === "going" ? t.showDetail.ctaGoing : t.showDetail.ctaWent;
  }, [show, t]);

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

  async function handleShare() {
    if (!show) return;
    const url = `${window.location.origin}/show/${encodeURIComponent(show.id)}`;
    const title = `${show.artist} — ${formatDate(show.eventDateIso)}`;
    const text = `${show.artist} no ${show.venue || show.city || "show"} — guarda essa memória com a gente no it's alive.`;
    trackEvent("show_share_click", { show_id: show.id });
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareConfirm("copied");
        window.setTimeout(() => setShareConfirm("idle"), 1800);
      }
    } catch {
      /* user cancelled / not allowed */
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
      aria-label={t.showDetail.overlayLabel}
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
            <button type="button" className="iconBtn iconBtnCentered" onClick={requestClose} aria-label={t.showDetail.closeLabel}>
              <CloseIcon />
            </button>
          ) : (
            <Link href="/" className="iconBtn iconBtnCentered" aria-label={t.showDetail.closeLabel}>
              <CloseIcon />
            </Link>
          )}
        </div>

        <p className="ticketDate detailDateTop">{formatDate(show.eventDateIso)}</p>
        <h1 className="detailTitle">{show.artist}</h1>
        <p className="ticketVenue detailVenue venueWithPin">
          <span className="venueText">{formatVenueLine(show)}</span>
        </p>
      </div>

      <div className={`detailHero cardImage ${artistImageUrl ? "hasPhoto" : ""}`}>
        {artistImageUrl ? (
          <>
            <Image
              src={artistImageUrl}
              alt={show.artist}
              fill
              sizes="(min-width: 900px) 520px, 100vw"
              className="detailHeroImage"
              priority
            />
            <div className="detailHeroOverlay" aria-hidden />
          </>
        ) : (
          show.artist
        )}
      </div>

      <div className="detailBody detailBodyTicket">
        {show.tourName ? <p className="resultMeta detailTour">{show.tourName}</p> : null}

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
            <span className="ctaMainLabel">{savingWallet ? t.showDetail.saving : `${ctaLabel}!`}</span>
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
              {t.showDetail.tickets}
            </a>
          ) : null}
          <button
            type="button"
            className={`chip chipGhost shareChip${shareConfirm === "copied" ? " isCopied" : ""}`}
            onClick={() => {
              void handleShare();
            }}
            aria-label={t.showDetail.shareLabel}
          >
            <ShareIcon />
            {shareConfirm === "copied" ? t.showDetail.linkCopied : t.showDetail.share}
          </button>
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
          {lastSyncFailed ? <p className="muted walletSyncHint">{t.showDetail.syncHint}</p> : null}
        </div>

        <div className="setlistPanel">
          <h2 className="setlistTitle">{t.showDetail.setlistTitle}</h2>
          {loading && !show.songNames.length ? (
            <p className="muted">{t.showDetail.loadingSongs}</p>
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
                      {t.showDetail.seeAll}
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
                      {t.showDetail.collapse}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">{t.showDetail.noSetlist}</p>
          )}
        </div>
      </div>

      <ShowFeedClient showId={id} viewer={viewer ?? null} />
    </section>
  ) : loading ? (
    <p className="emptyBox">{t.showDetail.loading}</p>
  ) : (
    <p className="emptyBox errorBox">{error ?? t.showDetail.notFound}</p>
  );

  if (isOverlay) {
    return (
      <div className="detailOverlayRoot" role="dialog" aria-modal="true" aria-label={t.showDetail.overlayLabel}>
        <button type="button" className="detailBackdrop" aria-label={t.showDetail.closeLabel} onClick={requestClose} />
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

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="iconSvg">
      <path
        d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"
        fill="currentColor"
      />
    </svg>
  );
}
