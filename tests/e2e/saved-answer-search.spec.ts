import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
  tab,
} from "./fixtures";
import type { Page } from "@playwright/test";

async function seed(page: Page, count = 12) {
  const records = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    question: "Tell me about a project you owned.",
    answer:
      index === 1
        ? `${answer} ${"Supporting context. ".repeat(30)} The cobalt migration had a distinct test plan. Full answer ending.`
        : `${answer} Synthetic attempt ${index + 1} about ordinary delivery.`,
    category: index === 1 ? "Technical" : "Behavioral",
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

test("phone search finds later answer details and keyboard clearing restores the full list", async ({
  page,
}) => {
  const records = await seed(page);
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (12)", exact: true })
    .click();
  const search = page.getByRole("searchbox", {
    name: "Search saved answers",
    exact: true,
  });
  await search.pressSequentially("TECHNICAL cobalt");
  await expect(search).toBeFocused();
  await expect(page.getByRole("status", { name: "Search results" })).toHaveText(
    "Showing 1 of 12 saved answers",
  );
  const row = page.locator(".quick-history-list > button");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".quick-answer-preview")).toContainText(
    "cobalt migration",
  );
  await expect(row.locator(".quick-answer-preview")).not.toHaveText(
    records[1].answer,
  );
  await row.click();
  await expect(page.locator(".quick-answer-detail .saved-answer")).toHaveText(
    records[1].answer,
  );
  await page
    .getByRole("button", { name: "Back to saved answers", exact: true })
    .click();
  await expect(row).toBeFocused();
  await expect(search).toHaveValue("TECHNICAL cobalt");
  await search.fill("[no matching answer](");
  await expect(
    page.getByRole("heading", { name: "No matching answers.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status", { name: "Search results" })).toHaveText(
    "Showing 0 of 12 saved answers",
  );
  await expect(
    page.getByRole("heading", {
      name: "Your first answer starts here.",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Clear search", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(search).toBeFocused();
  await expect(search).toBeEmpty();
  await expect(page.locator(".quick-history-list > button")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
});

test("filtered history survives practice and Advanced detours without replacing the current draft", async ({
  page,
}) => {
  await seed(page, 3);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  const draft = "Keep this current answer while I find earlier work.";
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  await page
    .getByRole("button", { name: "Saved answers (3)", exact: true })
    .click();
  const search = page.getByLabel("Search saved answers", { exact: true });
  await search.fill("cobalt");
  await page.locator(".quick-history-list > button").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Practice this question again", exact: true })
    .click();
  await expect(page.locator(".quick-answer-detail")).toBeVisible();
  await advancedWorkspace(page);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to saved answers", exact: true })
    .click();
  await expect(search).toHaveValue("cobalt");
  await expect(page.locator(".quick-history-list > button")).toHaveCount(1);
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    draft,
  );
  await expect(page.locator(".quick-question")).toHaveText(question);
  await tab(page, "Question bank");
  await page.getByLabel("Search questions").fill("slow");
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved answers (3)", exact: true })
    .click();
  await expect(search).toHaveValue("cobalt");
  await expect(page.locator(".quick-history-list > button")).toHaveCount(1);
  await tab(page, "Question bank");
  await expect(page.getByLabel("Search questions")).toHaveValue("slow");
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(3);
});

test("deleting a filtered answer leaves other records recoverable through Clear search", async ({
  page,
}) => {
  const records = await seed(page, 3);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (3)", exact: true })
    .click();
  const search = page.getByLabel("Search saved answers", { exact: true });
  await search.fill("cobalt");
  await page.locator(".quick-history-list > button").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(page.locator(".quick-answer-detail")).toHaveCount(0);
  await expect(search).toHaveValue("cobalt");
  await expect(page.getByRole("status", { name: "Search results" })).toHaveText(
    "Showing 0 of 2 saved answers",
  );
  await expect(
    page.getByRole("heading", { name: "Your saved answers.", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".quick-history-list > button")).toHaveCount(2);
  const remaining = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(
    remaining.map((record: { data: { id: string } }) => record.data.id).sort(),
  ).toEqual([records[0].id, records[2].id].sort());
});

test("a genuinely empty history keeps the simple start action without search controls", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers", exact: true })
    .click();
  await expect(
    page.getByLabel("Search saved answers", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Your first answer starts here.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await expect(
    page.getByRole("radiogroup", { name: "Practice goal" }),
  ).toBeVisible();
});
