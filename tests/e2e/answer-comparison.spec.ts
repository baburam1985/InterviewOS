import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  tab,
} from "./fixtures";

const question = "Tell me about a decision you made.";
const summary = "Compare with an earlier answer";
async function seed(
  page: Page,
  data: {
    answer?: string;
    category?: string;
    question?: string;
    createdAt?: string;
    id?: string;
  } = {},
) {
  const record = {
    id: randomUUID(),
    question,
    category: "Behavioral",
    answer,
    seconds: 0,
    createdAt: "2026-09-29T12:00:00.000Z",
    ...data,
  };
  const response = await page.request.post("/api/workspace", {
    data: { kind: "session", data: record },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return record;
}
async function openHistory(page: Page, count: number, createdAt?: string) {
  await page
    .getByRole("button", { name: `Saved answers (${count})`, exact: true })
    .click();
  const rows = page.locator(".quick-history-list > button");
  await (
    createdAt
      ? rows
          .filter({ has: page.locator(`time[datetime="${createdAt}"]`) })
          .first()
      : rows.first()
  ).click();
}
async function records(page: Page) {
  return (await (await page.request.get("/api/workspace")).json()).records;
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("a saved retry compares its real earlier answer without writing or losing an open draft", async ({
  page,
}) => {
  const first = await seed(page);
  await openQuickWorkspace(page);
  await openHistory(page, 1);
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Practice this question again", exact: true })
    .click();
  const updated = `${answer}\nI would explain the decision in a clearer sequence next time.`;
  await page.getByLabel("Your answer", { exact: true }).fill(updated);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const before = await records(page);
  expect(before).toHaveLength(2);
  expect(
    new Set(before.map((r: { data: { id: string } }) => r.data.id)).size,
  ).toBe(2);
  expect(
    before.find((r: { data: { id: string } }) => r.data.id === first.id).data
      .answer,
  ).toBe(answer);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const draft = "Keep this current draft unchanged while I compare saved work.";
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  let mutations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/workspace") && request.method() !== "GET")
      mutations++;
  });
  await openHistory(page, 2);
  await expect(page.locator(".answer-comparison")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.getByText(summary, { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Earlier saved answer", exact: true }),
  ).toHaveText(answer);
  await expect(
    page.getByRole("region", { name: "Selected saved answer", exact: true }),
  ).toHaveText(updated);
  await expect(page.locator(".answer-comparison")).toContainText(
    "not a complete version history",
  );
  await tab(page, "Progress");
  await page.getByText(summary, { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Selected saved answer", exact: true }),
  ).toHaveText(updated);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    draft,
  );
  expect(await records(page)).toEqual(before);
  expect(mutations).toBe(0);
});

test("comparison uses the nearest strictly earlier save of the same question and interview type", async ({
  page,
}) => {
  await seed(page, {
    answer: "The oldest version.",
    createdAt: "2026-09-29T10:00:00.000Z",
  });
  const earlier = await seed(page, {
    answer: "The nearest earlier version.",
    createdAt: "2026-09-29T11:00:00.000Z",
  });
  await seed(page, {
    answer: "Wrong question.",
    question: "Another question?",
    createdAt: "2026-09-29T11:59:00.000Z",
  });
  await seed(page, {
    answer: "Wrong category.",
    category: "Technical",
    createdAt: "2026-09-29T11:59:30.000Z",
  });
  const selected = await seed(page, { answer: "The selected version." });
  await seed(page, { answer: "A tied save is not earlier." });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (6)", exact: true })
    .click();
  await page
    .locator(".quick-history-list > button")
    .filter({ hasText: "The selected version." })
    .click();
  await page.getByText(summary, { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Earlier saved answer", exact: true }),
  ).toHaveText(earlier.answer);
  await expect(
    page.getByRole("region", { name: "Selected saved answer", exact: true }),
  ).toHaveText(selected.answer);
  await page
    .getByRole("button", { name: "Back to saved answers", exact: true })
    .click();
  await page
    .locator(".quick-history-list > button")
    .filter({ hasText: "The oldest version." })
    .click();
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
});

test("phone comparison exposes complete Unicode text and keyboard-scrollable named answers", async ({
  page,
}) => {
  const longAnswer =
    "  First line.\n" +
    "🧪".repeat(350) +
    "\n" +
    "Details I can explain. ".repeat(160) +
    "END OF EARLIER ANSWER";
  await seed(page, { answer: longAnswer });
  const selected = await seed(page, {
    answer: "My newer answer.\nA second line.",
    createdAt: "2026-09-29T12:01:00.000Z",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await openHistory(page, 2, selected.createdAt);
  const toggle = page.locator(".answer-comparison > summary");
  await toggle.focus();
  await page.keyboard.press("Enter");
  const earlierRegion = page.getByRole("region", {
    name: "Earlier saved answer",
    exact: true,
  });
  expect(await earlierRegion.textContent()).toBe(longAnswer);
  await page.keyboard.press("Tab");
  await expect(earlierRegion).toBeFocused();
  await page.keyboard.press("End");
  await expect
    .poll(() => earlierRegion.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("region", { name: "Selected saved answer", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await expect(page.locator(".answer-comparison")).toContainText("6 words");
});

test("identical answers are stated plainly and deleting the other record removes the comparison after reload", async ({
  page,
}) => {
  const earlier = await seed(page);
  const selected = await seed(page, { createdAt: "2026-09-29T12:01:00.000Z" });
  await openQuickWorkspace(page);
  await openHistory(page, 2);
  await page.getByText(summary, { exact: true }).click();
  await expect(
    page.getByText("The answer text is unchanged between these two saves.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await page.request.delete(`/api/workspace?id=${earlier.id}`)).ok(),
  ).toBeTruthy();
  await openQuickWorkspace(page);
  await openHistory(page, 1);
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
  // Editing the same record never creates an invented previous version.
  await seed(page, {
    id: selected.id,
    createdAt: "2026-09-29T12:02:00.000Z",
    answer: "Edited in place.",
  });
  await openQuickWorkspace(page);
  await openHistory(page, 1);
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
  await expect(page.locator(".saved-answer")).toHaveText("Edited in place.");
});
