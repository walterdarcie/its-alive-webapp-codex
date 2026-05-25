import { expect, test } from "@playwright/test";
import { withMvpMocks } from "@/tests/helpers/mock-routes";

test("home renders profile, tabs and meus shows agrupado por ano", async ({ page }) => {
  await withMvpMocks(page);
  await page.goto("/");
  await page.waitForTimeout(450);

  await expect(page.getByRole("tab", { name: "Novidades" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Meus shows" })).toBeVisible();

  // Switch to Meus shows
  await page.getByRole("tab", { name: "Meus shows" }).click();
  await expect(page.getByRole("heading", { name: "Eu vou!" })).toBeVisible();

  const futureCards = page.locator(".slider .card");
  const pastTickets = page.locator(".ticketList .ticket");
  await expect(futureCards).toHaveCount(2);
  await expect(pastTickets).toHaveCount(2);

  await expect(page.locator(".yearLabel")).toHaveCount(1);
  await expect(page.locator(".yearLabel span").first()).toHaveText("2025");

  await page.getByRole("button", { name: /metallica/i }).first().click();
  await page.waitForURL(/\/show\//);
  const ticketCard = page.locator(".ticketCard");
  await expect(ticketCard).toBeVisible();

  await page.getByRole("button", { name: /ver tudo/i }).click();
  await expect(page.getByRole("button", { name: /^recolher$/i })).toBeVisible();

  await page.getByRole("button", { name: "Voltar" }).click();
  await page.waitForURL("**/");
  await expect(ticketCard).toBeHidden();
});

test("home drawer abre via hamburger e fecha com ESC", async ({ page }) => {
  await withMvpMocks(page);
  await page.goto("/");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  const drawer = page.locator(".drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Meus shows", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Buscar amigos", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Termos de uso", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("search page com abas Shows / Amigos", async ({ page }) => {
  await withMvpMocks(page);
  await page.goto("/search");
  await page.waitForTimeout(200);

  await expect(page.getByRole("tab", { name: "Shows" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Buscar shows").fill("metallica");
  await page.waitForTimeout(900);

  const results = page.locator(".resultList .ticket");
  await expect(results).toHaveCount(4);

  // Trocar para a aba Amigos
  await page.getByRole("tab", { name: "Amigos" }).click();
  await expect(page.getByLabel("Buscar amigos")).toBeVisible();
  await page.getByLabel("Buscar amigos").fill("walt");
  await page.waitForTimeout(500);

  // O mock devolve lista vazia → empty box visível
  await expect(page.getByText(/Ninguém encontrado com esse nome ainda/i)).toBeVisible();
});
