"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ShowDetailRecord, ShowRecord, Viewer } from "@/lib/show-types";
import { deriveWalletStatus, formatVenueLine, isFutureOrTodayShow } from "@/lib/show-utils";
import { fetchArtistImageClient } from "@/lib/artist-image-client";
import { getWalletShow, isSavedInWallet, removeFromWalletServer, saveToWalletServer } from "@/lib/wallet-storage";
import { useLocale } from "@/lib/i18n-context";
import { trackEvent } from "@/lib/analytics";
import { ShowFeedClient } from "@/app/ui/show-feed-client";
import { SocialDrawer } from "@/app/ui/social-drawer";
import type { AttendeesPayload } from "@/app/api/shows/[id]/attendees/route";

type ShowDetailClientProps = {
  id: string;
  initialData?: ShowDetailRecord | null;
  isAuthenticated?: boolean;
  viewer?: Viewer | null;
};

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="iconSvg">
      <path d="M4 7h16 M4 12h16 M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="iconSvg">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="iconSvg">
      <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" fill="currentColor" />
    </svg>
  );
}

function buildAvatarStyle(avatarUrl: string): CSSProperties {
  const sanitized = avatarUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return { backgroundImage: `url("${sanitized}")` };
}

export function ShowDetailClient({ id, initialData, isAuthenticated = true, viewer = null }: ShowDetailClientProps) {
  const router = useRouter();
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
  const [shareConfirm, setShareConfirm] = useState<"idle" | "copied">("idle");
  const [attendees, setAttendees] = useState<AttendeesPayload | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setSaved(isSavedInWallet(id));
    setSetlistExpanded(false);
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
    let cancelled = false;
    async function loadAttendees() {
      try {
        const res = await fetch(`/api/shows/${encodeURIComponent(id)}/attendees`);
        if (!res.ok) return;
        const payload = (await res.json()) as AttendeesPayload;
        if (!cancelled) setAttendees(payload);
      } catch {
        /* swallow — attendees row is non-critical */
      }
    }
    void loadAttendees();
    return () => {
      cancelled = true;
    };
  }, [id, saved]);

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

  function handleBack() {
    trackEvent("show_detail_back_click", { show_id: id });
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  if (!show) {
    return (
      <main className="page pageSocial showDetailPage">
        <TopBar onOpenDrawer={() => setDrawerOpen(true)} onBack={handleBack} isAuthenticated={isAuthenticated} />
        {loading ? (
          <p className="emptyBox">{t.showDetail.loading}</p>
        ) : (
          <p className="emptyBox errorBox">{error ?? t.showDetail.notFound}</p>
        )}
        <SocialDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} source="show_detail" />
      </main>
    );
  }

  const isFuture = isFutureOrTodayShow(show.eventDateIso);
  const attendeesCount = attendees?.total ?? 0;
  const attendeesLabel = (() => {
    if (attendeesCount <= 0) {
      return isFuture ? t.showDetail.attendeesEmptyGoing : t.showDetail.attendeesEmptyWent;
    }
    return isFuture ? t.showDetail.attendeesGoing(attendeesCount) : t.showDetail.attendeesWent(attendeesCount);
  })();
  const visibleAvatars = attendees?.recent ?? [];

  return (
    <main className="page pageSocial showDetailPage">
      <TopBar onOpenDrawer={() => setDrawerOpen(true)} onBack={handleBack} isAuthenticated={isAuthenticated} />

      <article className="ticketCard" aria-label={t.showDetail.overlayLabel}>
        <header className="ticketCardHeader">
          <p className="ticketCardDate">{formatDate(show.eventDateIso)}</p>
          <h1 className="ticketCardTitle">{show.artist}</h1>
          <p className="ticketCardVenue">{formatVenueLine(show)}</p>
        </header>

        <div className="ticketCardPerf" aria-hidden>
          <span className="ticketCardPerfCutLeft" />
          <span className="ticketCardPerfCutRight" />
          <span className="ticketCardPerfDashed" />
        </div>

        <div className={`ticketCardHero ${artistImageUrl ? "hasPhoto" : ""}`}>
          {artistImageUrl ? (
            <Image
              src={artistImageUrl}
              alt={show.artist}
              fill
              sizes="(min-width: 900px) 520px, 100vw"
              className="ticketCardHeroImage"
              priority
            />
          ) : (
            <span className="ticketCardHeroFallback">{show.artist}</span>
          )}
        </div>

        <div className="ticketCardActions">
          <div className="ticketAttendees" aria-label={attendeesLabel}>
            {visibleAvatars.length ? (
              <ul className="ticketAttendeeAvatars">
                {visibleAvatars.map((person, index) => (
                  <li key={person.userId} className="ticketAttendeeAvatarWrap" style={{ zIndex: visibleAvatars.length - index }}>
                    {person.avatarUrl ? (
                      <span
                        className="ticketAttendeeAvatar ticketAttendeeAvatarPhoto"
                        style={buildAvatarStyle(person.avatarUrl)}
                        aria-label={person.displayName}
                      />
                    ) : (
                      <span className="ticketAttendeeAvatar ticketAttendeeAvatarFallback" aria-label={person.displayName} />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            <span className="ticketAttendeeCount">{attendeesLabel}</span>
          </div>

          <button
            type="button"
            className={`ctaMain ctaWithBurst ${saved ? "isActive" : ""} ${ctaBurst ? "ctaBurst" : ""}`}
            onClick={() => {
              void toggleWallet();
            }}
            aria-pressed={saved}
            disabled={savingWallet}
          >
            <span className="ctaMainLabel">{savingWallet ? t.showDetail.saving : `${ctaLabel}!`}</span>
            <span className="ctaMainPulse" aria-hidden />
            <span className="ctaSparkField" aria-hidden>
              <span className="ctaSpark ctaSpark1" />
              <span className="ctaSpark ctaSpark2" />
              <span className="ctaSpark ctaSpark3" />
              <span className="ctaSpark ctaSpark4" />
              <span className="ctaSpark ctaSpark5" />
              <span className="ctaSpark ctaSpark6" />
            </span>
          </button>
        </div>

        <div className="ticketCardSecondaryActions">
          {show.ticketUrl && isFuture ? (
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
        </div>

        {lastSyncFailed ? <p className="muted walletSyncHint">{t.showDetail.syncHint}</p> : null}

        {show.tourName ? <p className="resultMeta ticketCardTour">{show.tourName}</p> : null}

        <div className="ticketCardSetlist">
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
      </article>

      <ShowFeedClient showId={id} viewer={viewer ?? null} />

      <SocialDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} source="show_detail" />
    </main>
  );
}

function TopBar({
  onOpenDrawer,
  onBack,
  isAuthenticated
}: {
  onOpenDrawer: () => void;
  onBack: () => void;
  isAuthenticated: boolean;
}) {
  const { t } = useLocale();
  return (
    <header className="topBarSocial showDetailTopBar">
      <button type="button" className="showDetailBackBtn" onClick={onBack} aria-label={t.common.back}>
        <ArrowLeftIcon />
        <span className="showDetailBackLabel">{t.common.back}</span>
      </button>
      <Link href="/" aria-label={t.common.goHome} className="brandLogoLink">
        <Image src="/brand/logo-default.svg" alt="it's alive" width={148} height={44} className="brandLogo" />
      </Link>
      {isAuthenticated ? (
        <button
          type="button"
          className="hamburgerBtn iconBtn"
          aria-label={t.common.openMenu}
          onClick={() => {
            trackEvent("social_drawer_open", { source: "show_detail" });
            onOpenDrawer();
          }}
        >
          <HamburgerIcon />
        </button>
      ) : (
        <span aria-hidden />
      )}
    </header>
  );
}
