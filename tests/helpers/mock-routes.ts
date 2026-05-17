import type { Page } from "@playwright/test";
import { MOCK_ARTIST_IMAGE, MOCK_DETAIL_PAYLOAD, MOCK_SEARCH_SHOWS } from "@/tests/helpers/mvp-fixtures";

export async function withMvpMocks(page: Page) {
  await page.route("**/api/artist-image**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ARTIST_IMAGE)
    });
  });

  await page.route("**/api/setlists/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/setlists/search")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          shows: MOCK_SEARCH_SHOWS,
          page: 1,
          total: MOCK_SEARCH_SHOWS.length,
          itemsPerPage: 20
        })
      });
      return;
    }

    const id = url.split("/api/setlists/")[1]?.split("?")[0];
    const selected = MOCK_SEARCH_SHOWS.find((show) => show.id === id) ?? MOCK_SEARCH_SHOWS[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DETAIL_PAYLOAD,
        id: selected.id,
        artist: selected.artist,
        venue: selected.venue,
        city: selected.city,
        country: selected.country,
        eventDateIso: selected.eventDateIso,
        artistMbid: selected.artistMbid
      })
    });
  });

  // Social endpoints — default to empty payloads so the home renders
  // without depending on Supabase being reachable.
  await page.route("**/api/profiles/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          userId: "bypass-user",
          displayName: "QA User",
          avatarUrl: null,
          followingCount: 0,
          followerCount: 0,
          isViewerFollowing: false,
          isSelf: true
        }
      })
    });
  });

  await page.route("**/api/feed/following", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] })
    });
  });

  await page.route("**/api/shows/trending", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shows: [] })
    });
  });

  await page.route("**/api/profiles/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profiles: [] })
    });
  });

  await page.addInitScript((shows) => {
    const store = {
      items: Object.fromEntries(
        shows.map((show: { id: string }) => [
          show.id,
          {
            show,
            savedAt: "2026-02-28T00:00:00.000Z"
          }
        ])
      )
    };
    localStorage.setItem("its-alive.wallet.v1", JSON.stringify(store));
  }, MOCK_SEARCH_SHOWS);
}
