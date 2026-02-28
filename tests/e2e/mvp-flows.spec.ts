import { expect, test } from "@playwright/test";
import { withMvpMocks } from "@/tests/helpers/mock-routes";

test("home shows wallet split and detail open/close flow", async ({ page }) => {
  await withMvpMocks(page);
  await page.goto("/");
  await page.waitForTimeout(450);

  await expect(page.getByRole("heading", { name: "Eu vou!" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Eu fui!" })).toBeVisible();

  const futureCards = page.locator(".slider .card");
  const pastTickets = page.locator(".ticketList .ticket");
  await expect(futureCards).toHaveCount(2);
  await expect(pastTickets).toHaveCount(2);

  await page.getByRole("button", { name: /metallica/i }).first().click();
  const detailSheet = page.locator(".detailSheetOverlay");
  await expect(detailSheet).toBeVisible();

  await page.getByRole("button", { name: /setlist completa/i }).click();
  await expect(page.getByRole("button", { name: /recolher setlist/i })).toBeVisible();

  await page.getByRole("button", { name: /fechar detalhes/i }).click();
  await expect(detailSheet).toBeHidden();
});

test("search page flow and result rendering", async ({ page }) => {
  await withMvpMocks(page);
  await page.goto("/search");
  await page.getByLabel("Buscar shows").fill("metallica");
  await page.waitForTimeout(900);

  const results = page.locator(".resultList .ticket");
  await expect(results).toHaveCount(4);

  await results.first().click();
  await expect(page.locator(".detailSheetOverlay")).toBeVisible();
});
