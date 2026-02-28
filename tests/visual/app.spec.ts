import { expect, test, type Page } from "@playwright/test";

const MOCK_SEARCH_SHOWS = [
  {
    id: "future-01",
    artist: "Red Hot Chilli Peppers",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    country: "USA",
    eventDateIso: "2026-12-10",
    artistMbid: "mbid-rhcp"
  },
  {
    id: "future-02",
    artist: "System of a Down",
    venue: "Autódromo de Interlagos",
    city: "São Paulo, SP",
    country: "Brasil",
    eventDateIso: "2026-12-12",
    artistMbid: "mbid-soad"
  },
  {
    id: "past-01",
    artist: "Metallica",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    country: "USA",
    eventDateIso: "2025-06-29",
    artistMbid: "mbid-metallica"
  },
  {
    id: "past-02",
    artist: "Angra",
    venue: "Tokio Marine Hall",
    city: "São Paulo, SP",
    country: "Brasil",
    eventDateIso: "2025-03-03",
    artistMbid: "mbid-angra"
  }
];

const DETAIL_PAYLOAD = {
  id: "past-01",
  artist: "Metallica",
  venue: "Kia Forum",
  city: "Inglewood, CA",
  country: "USA",
  eventDateIso: "2025-06-29",
  artistMbid: "mbid-metallica",
  setlistUrl: "https://www.setlist.fm/setlist/example",
  tourName: "M72 World Tour",
  songNames: [
    "Creeping Death",
    "Harvester of Sorrow",
    "Hit the Lights",
    "King Nothing",
    "72 Seasons",
    "Fuel",
    "Sad but True",
    "One",
    "Master of Puppets",
    "Enter Sandman"
  ],
  setlistSections: [
    {
      label: "Main Set",
      songs: [
        "Creeping Death",
        "Harvester of Sorrow",
        "Hit the Lights",
        "King Nothing",
        "72 Seasons",
        "Fuel",
        "Sad but True",
        "One",
        "Master of Puppets",
        "Enter Sandman"
      ]
    }
  ]
};

async function withVisualMocks(page: Page) {
  await page.route("**/api/artist-image**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        imageUrl: "https://images.unsplash.com/photo-1501612780327-45045538702b",
        pageUrl: "https://wikipedia.org",
        source: "wikipedia"
      })
    });
  });

  await page.route("**/api/setlists/search**", async (route) => {
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
  });

  await page.route("**/api/setlists/past-01", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DETAIL_PAYLOAD)
    });
  });

  await page.addInitScript((shows) => {
    const store = {
      items: Object.fromEntries(
        shows.map((show) => [
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

test("home and search visual baseline", async ({ page }) => {
  await withVisualMocks(page);
  await page.goto("/");
  await page.waitForTimeout(450);
  await expect(page).toHaveScreenshot("home.png", { fullPage: true });

  await page.goto("/search");
  await page.getByLabel("Buscar shows").fill("metallica");
  await page.waitForTimeout(900);
  await expect(page).toHaveScreenshot("search.png", { fullPage: true });
});

test("detail overlay visual baseline", async ({ page }) => {
  await withVisualMocks(page);
  await page.goto("/");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: /metallica/i }).first().click();
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("detail.png", { fullPage: true });
});
