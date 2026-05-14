import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { withMvpMocks } from "@/tests/helpers/mock-routes";

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, {
    path,
    contentType: "image/png"
  });
}

test("home and search visual QA", async ({ page }, testInfo) => {
  await withMvpMocks(page);
  await page.goto("/");
  await page.waitForTimeout(450);

  const slider = page.locator(".slider").first();
  await expect(slider).toBeVisible();
  const sliderBox = await slider.boundingBox();
  const firstCardBox = await page.locator(".slider .card").first().boundingBox();
  expect(sliderBox).not.toBeNull();
  expect(firstCardBox).not.toBeNull();

  if (sliderBox && firstCardBox && testInfo.project.name.includes("mobile")) {
    const ratio = firstCardBox.width / sliderBox.width;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
  }

  await attachScreenshot(page, testInfo, "home.png");

  await page.goto("/search");
  await page.getByLabel("Buscar shows").fill("metallica");
  await page.waitForTimeout(900);

  await expect(page.getByText("Metallica", { exact: false }).first()).toBeVisible();
  await attachScreenshot(page, testInfo, "search.png");
});

test("detail visual QA", async ({ page }, testInfo) => {
  await withMvpMocks(page);
  await page.goto("/");
  await page.waitForTimeout(450);

  await page.getByRole("button", { name: /metallica/i }).first().click();
  await page.waitForTimeout(500);

  const detailSheet = page.locator(".detailSheetOverlay");
  await expect(detailSheet).toBeVisible();
  await expect(page.locator(".detailOverlayContainer").getByLabel("Fechar detalhes")).toBeVisible();

  await attachScreenshot(page, testInfo, "detail.png");
});
