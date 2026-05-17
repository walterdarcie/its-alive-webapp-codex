import { expect, test } from "@playwright/test";

// Tests order-agnostic search behavior against the live setlist.fm + Ticketmaster
// pipeline. Skipped by default to avoid hitting external APIs on every PR; gate
// is `LIVE_SEARCH_TESTS=1`, set by `npm run test:search` and by the post-merge
// `search-live` CI job (which also provides the real API keys).
const LIVE = process.env.LIVE_SEARCH_TESTS === "1";

const SEARCH_CASES = [
  // Nome simples
  "Metallica",
  // Nome composto completo e parcial
  "Tame Impala",
  "Tame Imp",
  // Nome + ano em qualquer ordem
  "Metallica 2010",
  "2010 Metallica",
  "Tame Impala 2010",
  "2010 Tame Imp",
  // Nome + cidade em qualquer ordem
  "Metallica São Paulo",
  "São Paulo Metallica",
  "Tame Impala Bogotá",
  "Bogotá Tame Imp",
  // Nome + ano + cidade em qualquer ordem
  "Metallica 2010 São Paulo",
  "São Paulo 2010 Metallica",
  "2010 Metallica São Paulo",
  // Tame Impala em Bogotá só existe em 2016 no setlist.fm; usamos esse ano para
  // que o teste valide o parser sem depender de dado que não existe.
  "Tame Impala Bogotá 2016",
  "2016 Bogotá Tame Imp"
] as const;

// Cases sem filtro de ano no passado — devem retornar pelo menos um show futuro
// do Ticketmaster. Os cases com ano passado pulam a chamada do TM por design.
const TM_VALIDATION_CASES = [
  "Metallica",
  "Tame Impala",
  "Tame Imp",
  "Metallica São Paulo",
  "São Paulo Metallica",
  "Tame Impala Bogotá",
  "Bogotá Tame Imp"
] as const;

const describeLive = LIVE ? test.describe : test.describe.skip;

describeLive("busca end-to-end (API real)", () => {
  // Mais retries que o padrão (2) porque dependemos de APIs externas (setlist.fm,
  // Ticketmaster) que ocasionalmente devolvem 5xx ou rate-limit transitórios.
  test.describe.configure({ retries: 3 });

  // setlist.fm tolera 2 req/s no plano contratado, e cada caso de teste pode
  // gerar mais de uma chamada interna (MBID resolve, plano principal, fallback
  // de venue). Um respiro entre casos espalha o tráfego e evita 429 em cascata.
  test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  for (const query of SEARCH_CASES) {
    test(`retorna >=1 show para: ${query}`, async ({ request }) => {
      const response = await request.get(
        `/api/setlists/search?searchTerm=${encodeURIComponent(query)}&p=0`
      );
      expect(response.status(), "API status").toBe(200);
      const body = (await response.json()) as { shows: Array<{ id: string }> };
      expect(Array.isArray(body.shows), "shows deve ser array").toBe(true);
      expect(
        body.shows.length,
        `"${query}" deve retornar pelo menos 1 show — ordem dos termos não deve afetar`
      ).toBeGreaterThan(0);
    });
  }

  for (const query of TM_VALIDATION_CASES) {
    test(`Ticketmaster: retorna >=1 show futuro para: ${query}`, async ({ request }) => {
      const response = await request.get(
        `/api/setlists/search?searchTerm=${encodeURIComponent(query)}&p=0`
      );
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { shows: Array<{ id: string }> };
      const tmShows = body.shows.filter((show) => show.id.startsWith("tm-"));
      expect(
        tmShows.length,
        `"${query}" deve incluir pelo menos 1 show do Ticketmaster (id "tm-...") — valida a integração da Discovery API`
      ).toBeGreaterThan(0);
    });
  }
});
