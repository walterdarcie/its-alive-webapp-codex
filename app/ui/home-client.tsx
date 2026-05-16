"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ShowRecord, Viewer } from "@/lib/show-types";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { buildArtistImageKey, fetchArtistImageClient } from "@/lib/artist-image-client";
import { getWalletEntries, hydrateWalletFromServer, type WalletEntry } from "@/lib/wallet-storage";
import { daysUntilShow, formatDatePtBrLong, formatVenueLine, isFutureOrTodayShow } from "@/lib/show-utils";
import type { ViewerProfile } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";

function BrandHeader({ viewer }: { viewer: ViewerProfile }) {
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
    trackEvent("sign_out_click", { source: "home_header_menu" });
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
      <div className="profileMenuWrap" ref={menuRef}>
        <button
          type="button"
          className="avatarStub avatarButtonReset"
          aria-label={`Abrir menu da conta de ${viewer.name}`}
          aria-expanded={isMenuOpen}
          onClick={() =>
            setIsMenuOpen((v) => {
              const next = !v;
              if (next) trackEvent("profile_menu_open", { source: "home_header" });
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
            <p className="profileMenuHint">Seus shows ficam salvos em qualquer dispositivo</p>
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

function buildPhotoStyle(imageUrl: string, overlay: "hero" | "thumb"): CSSProperties {
  const sanitized = imageUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const heroOverlay = "linear-gradient(180deg, rgba(7, 14, 30, 0.18), rgba(7, 14, 30, 0.5))";
  const thumbOverlay = "linear-gradient(180deg, rgba(9, 19, 43, 0.15), rgba(9, 19, 43, 0.34))";
  return {
    backgroundImage: `${overlay === "hero" ? heroOverlay : thumbOverlay}, url("${sanitized}")`,
    backgroundPosition: "center",
    backgroundSize: "cover"
  };
}

function EventCard({ show, imageUrl }: { show: ShowRecord; imageUrl?: string }) {
  const daysAway = daysUntilShow(show.eventDateIso);
  const dateLabel = formatDatePtBrLong(show.eventDateIso);
  return (
    <article className="card">
      <div className={`cardImage ${imageUrl ? "hasPhoto" : ""}`} style={imageUrl ? buildPhotoStyle(imageUrl, "hero") : undefined}>
        {imageUrl ? null : show.artist}
      </div>
      <div className="cardBody">
        <div className="cardMeta">
          {daysAway > 0 ? `Faltam ${daysAway} dias!` : daysAway === 0 ? "É hoje!" : dateLabel}
        </div>
        <h3 className="cardTitle">{show.artist}</h3>
        <div className="cardVenue venueWithPin">
          <span className="venueText">{formatVenueLine(show)}</span>
        </div>
      </div>
    </article>
  );
}

function TicketRow({
  show,
  imageUrl,
  onOpenDetail
}: {
  show: ShowRecord;
  imageUrl?: string;
  onOpenDetail: (showId: string) => void;
}) {
  return (
    <div className="ticketWrap">
      <button type="button" className="ticket ticketClickable ticketButtonReset" onClick={() => onOpenDetail(show.id)}>
        <div className={`ticketThumb ${imageUrl ? "hasPhoto" : ""}`} style={imageUrl ? buildPhotoStyle(imageUrl, "thumb") : undefined}>
          {imageUrl ? null : show.artist}
        </div>
        <div className="ticketBody">
          <p className="ticketDate">{formatDatePtBrLong(show.eventDateIso)}</p>
          <h3 className="ticketName">{show.artist}</h3>
          <p className="ticketVenue venueWithPin">
            <span className="venueText">{formatVenueLine(show)}</span>
          </p>
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

function EmptyWalletOnboarding() {
  return (
    <section className="onboardingEntry" aria-label="Comece sua carteira">
      <div className="onboardingGlow onboardingGlowA" aria-hidden />
      <div className="onboardingGlow onboardingGlowB" aria-hidden />
      <div className="onboardingBeam" aria-hidden />

      <div className="onboardingCard">
        <p className="onboardingKicker">Shows acabam. Memórias não.</p>
        <h2 className="onboardingTitle">
          Alguns momentos duram poucas horas.
          <br />
          Mas a emoção fica para sempre.
        </h2>
        <p className="onboardingSubtitle">
          Use a busca para cadastrar os shows que marcaram sua vida e mantenha suas memórias vivas em qualquer dispositivo.
        </p>

        <Link
          href="/search"
          className="ctaMain onboardingCta"
          onClick={() => {
            trackEvent("onboarding_empty_wallet_cta_click", { source: "home_empty_wallet" });
          }}
        >
          <span className="ctaMainLabel">Buscar meus shows agora</span>
        </Link>
      </div>
    </section>
  );
}

function FutureShowsOnboarding() {
  return (
    <section className="onboardingEntry onboardingEntryInline" aria-label="Encontre próximos shows">
      <div className="onboardingGlow onboardingGlowA" aria-hidden />
      <div className="onboardingGlow onboardingGlowB" aria-hidden />
      <div className="onboardingBeam" aria-hidden />

      <div className="onboardingCard">
        <p className="onboardingKicker">O próximo momento inesquecível começa na busca.</p>
        <h2 className="onboardingTitle onboardingTitleInline">
          A expectativa também faz parte da emoção.
          <br />
          Qual é o seu próximo show?
        </h2>
        <p className="onboardingSubtitle">Descubra próximas datas dos seus artistas favoritos e mantenha sua agenda de emoções ao vivo atualizada.</p>
        <Link
          href="/search"
          className="ctaMain onboardingCta"
          onClick={() => {
            trackEvent("onboarding_future_shows_cta_click", { source: "home_future_empty" });
          }}
        >
          <span className="ctaMainLabel">Buscar próximos shows</span>
        </Link>
      </div>
    </section>
  );
}

export function HomeClient({ viewer }: { viewer: ViewerProfile }) {
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [artistImageMap, setArtistImageMap] = useState<Record<string, string>>({});
  const [walletSynced, setWalletSynced] = useState<boolean | null>(null);

  function openShowOverlay(showId: string) {
    setSelectedShowId(showId);
    window.history.pushState({ showOverlay: showId }, "", `/show/${encodeURIComponent(showId)}`);
  }

  function closeShowOverlay() {
    setSelectedShowId(null);
    window.history.pushState({}, "", "/");
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

  useEffect(() => {
    let cancelled = false;
    void hydrateWalletFromServer().then((result) => {
      if (!cancelled) {
        setWalletEntries(result.entries);
        setWalletSynced(result.synced);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let lastFocusSync = 0;

    function syncWalletFromServer() {
      const now = Date.now();
      if (now - lastFocusSync < 2000) return;
      lastFocusSync = now;
      void hydrateWalletFromServer().then((result) => {
        setWalletEntries(result.entries);
        setWalletSynced(result.synced);
      });
    }

    function syncWalletFromLocal() {
      setWalletEntries(getWalletEntries());
    }

    window.addEventListener("focus", syncWalletFromServer);
    window.addEventListener("storage", syncWalletFromLocal);
    return () => {
      window.removeEventListener("focus", syncWalletFromServer);
      window.removeEventListener("storage", syncWalletFromLocal);
    };
  }, []);

  const { futureShows, pastShows } = useMemo(() => splitWallet(walletEntries), [walletEntries]);
  const walletShows = useMemo(() => [...futureShows, ...pastShows], [futureShows, pastShows]);
  const hasWalletContent = walletShows.length > 0;

  useEffect(() => {
    if (!walletShows.length) return;
    let cancelled = false;

    async function loadArtistImages() {
      const candidates = new Map<
        string,
        {
          artistName: string;
          artistMbid?: string;
          preloaded?: string;
        }
      >();

      for (const show of walletShows) {
        const key = buildArtistImageKey(show.artist, show.artistMbid);
        if (!key || candidates.has(key)) continue;

        candidates.set(key, {
          artistName: show.artist,
          artistMbid: show.artistMbid,
          preloaded: show.artistImageUrl
        });
      }

      const entries = Array.from(candidates.entries());
      const resolved = await Promise.all(
        entries.map(async ([key, candidate]) => {
          if (candidate.preloaded) return [key, candidate.preloaded] as const;
          const imagePayload = await fetchArtistImageClient({
            artistName: candidate.artistName,
            artistMbid: candidate.artistMbid
          });
          return [key, imagePayload.imageUrl] as const;
        })
      );

      if (cancelled) return;

      setArtistImageMap((current) => {
        const next = { ...current };
        for (const [key, imageUrl] of resolved) {
          if (!imageUrl) continue;
          next[key] = imageUrl;
        }
        return next;
      });
    }

    void loadArtistImages();
    return () => {
      cancelled = true;
    };
  }, [walletShows]);

  function resolveShowImageUrl(show: ShowRecord) {
    if (show.artistImageUrl) return show.artistImageUrl;
    const key = buildArtistImageKey(show.artist, show.artistMbid);
    if (!key) return undefined;
    return artistImageMap[key];
  }

  return (
    <main className="page">
      <BrandHeader viewer={viewer} />

      <Link
        href="/search"
        className="search searchButton searchNavButton"
        onClick={() => {
          trackEvent("search_entry_click", { source: "home_top_search" });
        }}
      >
        <SearchIcon />
        <span>Encontre shows incríveis</span>
      </Link>

      {hasWalletContent ? (
        <>
          {futureShows.length ? (
            <section className="section" aria-labelledby="shows-futuros">
              <h2 id="shows-futuros" className="sectionTitle">
                Eu vou!
              </h2>
              <div className={`slider ${futureShows.length > 1 ? "sliderPeek" : ""}`}>
                {futureShows.map((show) => (
                  <button
                    key={show.id}
                    type="button"
                    className="cardLink cardButtonReset"
                    onClick={() => {
                      trackEvent("show_detail_open", { source: "home_future_slider", show_id: show.id });
                      openShowOverlay(show.id);
                    }}
                  >
                    <EventCard show={show} imageUrl={resolveShowImageUrl(show)} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="section" aria-labelledby="shows-passados">
            <h2 id="shows-passados" className="sectionTitle">
              Eu fui!
            </h2>
            {pastShows.length ? (
              <div className="ticketList">
                {pastShows.map((show) => (
                  <TicketRow
                    key={show.id}
                    show={show}
                    imageUrl={resolveShowImageUrl(show)}
                    onOpenDetail={(showId) => {
                      trackEvent("show_detail_open", { source: "home_past_list", show_id: showId });
                      openShowOverlay(showId);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="muted">Nenhum show passado guardado ainda.</p>
            )}
          </section>

          {!futureShows.length ? <FutureShowsOnboarding /> : null}
        </>
      ) : (
        <EmptyWalletOnboarding />
      )}

      <p className={`footerHint ${hasWalletContent && walletSynced === false ? "footerHintOffline" : ""}`}>
        {!hasWalletContent
          ? "Sua carteira começa na busca. Encontre um show e marque como Eu fui ou Eu vou para guardar a memória."
          : walletSynced === false
            ? "Seus shows estão salvos aqui. A sincronização volta assim que a conexão retornar."
            : "Tudo sincronizado. Suas memórias estão disponíveis em qualquer dispositivo."}
      </p>

      {selectedShowId ? (
        <ShowDetailClient
          id={selectedShowId}
          mode="overlay"
          onClose={closeShowOverlay}
          isAuthenticated
          viewer={{ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } satisfies Viewer}
        />
      ) : null}
    </main>
  );
}
