import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
  tab,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("detailed guest feedback reveals actual text matches without crowding the retry flow or changing the answer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().clearCookies();
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts++;
  });
  await openQuickWorkspace(page);
  await page.getByRole("radio", { name: /Tell a work story/ }).check();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const answer =
    "During a project the team tested a prototype. First we checked it because the result reduced failures by 20 percent.";
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  const review = page.locator(".quick-feedback .review");
  await expect(review).not.toBeVisible();
  const details = page.getByText("See detailed feedback", { exact: true });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(details).toBeFocused();
  await expect(review).toBeVisible();
  const scene = review.locator(".check").filter({ hasText: "Sets the scene" });
  await expect(scene).toContainText("Matched text:");
  await expect(scene.locator("q")).toHaveText("During");
  await expect(scene.locator("mark")).toHaveText("During");
  await expect(scene.locator(".check-excerpt")).toContainText(
    "During a project the team tested",
  );
  const ownership = review
    .locator(".check")
    .filter({ hasText: "Shows ownership" });
  await expect(ownership).toContainText(
    "No configured keyword or phrase matched",
  );
  await expect(ownership.locator("mark")).toHaveCount(0);
  await expect(review).toContainText(
    "20 words. This built-in rule uses a 60–300 word range",
  );
  await expect(review).toContainText(
    "not proof of a complete or correct answer",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await advancedWorkspace(page);
  await expect(
    page
      .locator(".practice .review .check")
      .filter({ hasText: "Sets the scene" })
      .locator("mark"),
  ).toHaveText("During");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  expect(posts).toBe(0);
});

test("saved evidence follows the selected answer and category across both modes without touching a current draft", async ({
  page,
}) => {
  const answer =
    "The input includes a list of keys. My approach uses a cache, compares time complexity, and tests duplicate entries for 20 users.";
  const response = await page.request.post("/api/workspace", {
    data: {
      kind: "session",
      data: {
        id: randomUUID(),
        question: "How would you check this lookup service?",
        category: "Technical",
        answer,
        seconds: 0,
        createdAt: new Date().toISOString(),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const draft = "My unrelated current draft must remain unchanged.";
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await page.getByText("See detailed feedback", { exact: true }).click();
  const review = page.locator(".quick-answer-detail .review");
  await expect(
    review
      .locator(".check")
      .filter({ hasText: "Clarifies requirements" })
      .locator("mark"),
  ).toHaveText("input");
  await expect(
    review.locator(".check").filter({ hasText: "Shows ownership" }),
  ).toHaveCount(0);
  await expect(review).not.toContainText(draft);
  await expect(page.locator(".quick-answer-detail .saved-answer")).toHaveText(
    answer,
  );
  await tab(page, "Progress");
  const advanced = page.locator(".history .review");
  await expect(
    advanced
      .locator(".check")
      .filter({ hasText: "Clarifies requirements" })
      .locator("mark"),
  ).toHaveText("input");
  await expect(advanced).not.toContainText(draft);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    draft,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
});

test("an inconsistent saved check shows an unavailable explanation instead of invented evidence", async ({
  page,
}) => {
  const response = await page.request.post("/api/workspace", {
    data: {
      kind: "session",
      data: {
        id: randomUUID(),
        question: "Tell me about the work.",
        category: "Behavioral",
        answer: "Hello there.",
        seconds: 0,
        createdAt: new Date().toISOString(),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.records[0].data.review.checks[0].pass = true;
    await route.fulfill({ response, json: data });
  });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await page.getByText("See detailed feedback", { exact: true }).click();
  const scene = page
    .locator(".quick-answer-detail .check")
    .filter({ hasText: "Sets the scene" });
  await expect(scene).toContainText(
    "An explanation for this saved check is unavailable with the current rules.",
  );
  await expect(scene.locator("mark")).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
});
