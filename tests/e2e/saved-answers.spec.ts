import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
} from "./fixtures";
import type { Page } from "@playwright/test";

async function seedAnswers(page: Page, count = 12) {
  const records = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    question: "Tell me about a project you owned.",
    category: "Behavioral",
    answer: `${answer} Synthetic saved attempt ${index + 1}.`,
    seconds: 0,
    createdAt: new Date(Date.UTC(2026, 8, 30, 8, 0, index)).toISOString(),
  }));
  for (const data of records) {
    expect(
      (
        await page.request.post("/api/workspace", {
          data: { kind: "session", data },
        })
      ).ok(),
    ).toBeTruthy();
  }
  return records;
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("long phone history opens a visible named detail and Back restores the chosen row", async ({
  page,
}) => {
  const records = await seedAnswers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (12)", exact: true })
    .click();
  const rows = page.locator(".quick-history-list > button");
  await expect(rows).toHaveCount(12);
  const selected = records[3];
  const row = rows.filter({
    has: page.locator(`time[datetime="${selected.createdAt}"]`),
  });
  await row.scrollIntoViewIfNeeded();
  const priorName = await row.innerText();
  const times = await rows.locator("time").allTextContents();
  expect(new Set(times).size).toBe(12);
  await row.click();
  const detail = page.getByRole("region", {
    name: selected.question,
    exact: true,
  });
  await expect(detail).toBeFocused();
  await expect(page.locator(".quick-history-list")).toHaveCount(0);
  await expect(detail.locator(".saved-answer")).toHaveText(selected.answer);
  const back = page.getByRole("button", {
    name: "Back to saved answers",
    exact: true,
  });
  await expect(back).toBeInViewport();
  await expect(
    detail.getByRole("heading", { name: selected.question, exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  const downloadPromise = page.waitForEvent("download");
  await detail
    .getByRole("button", { name: "Export review", exact: true })
    .click();
  const download = await downloadPromise;
  const exported = await readFile((await download.path())!, "utf8");
  expect(exported).toContain(selected.answer);
  expect(exported).toContain(selected.question);
  await back.click();
  await expect(rows).toHaveCount(12);
  await expect(row).toBeFocused();
  await expect(row).toHaveText(priorName, { useInnerText: true });
  await expect(row).toBeInViewport();
});

test("keyboard history navigation keeps the active draft and supports a cancelled retry", async ({
  page,
}) => {
  const records = await seedAnswers(page, 2);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const currentQuestion = await page.locator(".quick-question").innerText();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("My current unsaved practice draft.");
  await page
    .getByRole("button", { name: "Saved answers (2)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your saved answers.", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.locator(".quick-history-list > button").first(),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#saved-answer-detail")).toBeFocused();
  await expect(page.locator(".saved-answer")).toHaveText(records[1].answer);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Practice this question again", exact: true })
    .click();
  await expect(page.locator("#saved-answer-detail")).toBeVisible();
  await page
    .getByRole("button", { name: "Back to saved answers", exact: true })
    .click();
  await expect(
    page.locator(".quick-history-list > button").first(),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#saved-answer-detail")).toBeFocused();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.locator(".quick-question")).toHaveText(currentQuestion);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "My current unsaved practice draft.",
  );
});

test("delete cancellation and failure keep detail, and successful removal returns focus to the list", async ({
  page,
}) => {
  const records = await seedAnswers(page, 2);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (2)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").first().click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(page.locator(".saved-answer")).toHaveText(records[1].answer);
  let fail = true;
  await page.route("**/api/workspace?*", (route) => {
    if (route.request().method() === "DELETE" && fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic delete failure" },
      });
    }
    return route.fallback();
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic delete failure",
  );
  await expect(page.locator(".saved-answer")).toHaveText(records[1].answer);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(page.locator("#saved-answer-detail")).toHaveCount(0);
  await expect(page.locator(".quick-history-list > button")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Your saved answers.", exact: true }),
  ).toBeFocused();
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator(".saved-answer")).toHaveText(records[0].answer);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your first answer starts here.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your saved answers.", exact: true }),
  ).toBeFocused();
});

test("Back preserves shared selection across modes, and the Saved answers tab always returns to the list", async ({
  page,
}) => {
  const records = await seedAnswers(page, 2);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (2)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").last().click();
  await page
    .getByRole("button", { name: "Back to saved answers", exact: true })
    .click();
  await advancedWorkspace(page);
  await expect(page.locator("#saved-answer-detail .saved-answer")).toHaveText(
    records[0].answer,
  );
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.locator("#saved-answer-detail")).toBeFocused();
  await expect(page.locator(".saved-answer")).toHaveText(records[0].answer);
  await page
    .getByRole("button", { name: "Saved answers (2)", exact: true })
    .click();
  await expect(page.locator(".quick-history-list > button")).toHaveCount(2);
  await page.locator(".quick-history-list > button").last().click();
  await expect(page.locator(".saved-answer")).toHaveText(records[0].answer);
});
