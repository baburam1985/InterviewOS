import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
  tab,
} from "../e2e/fixtures";

const savedRecords = async (page: Page) =>
  (await (await page.request.get("/api/workspace")).json()).records;
const quickMode = (page: Page) =>
  page.getByRole("button", { name: "Quick practice", exact: true }).click();
async function downloadText(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const file = await download.path();
  if (!file) throw new Error("The local download was unavailable.");
  return readFile(file, "utf8");
}
test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("guest practice continues through sign-in, a saved retry, reload, search, comparison and export", async ({
  page,
}) => {
  await page.context().clearCookies();
  await openQuickWorkspace(page);
  await expect(
    page.getByRole("button", { name: "Quick practice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  const firstAnswer = `${answer}\nI can explain these results with a concrete example. 🧪`;
  await page.getByLabel("Your answer", { exact: true }).fill(firstAnswer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  const nextStep = await page.locator(".quick-next-step").innerText();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  const recovery = page.getByRole("region", {
    name: "Resume practice after sign-in",
  });
  await expect(recovery).toBeVisible();
  expect(await savedRecords(page)).toEqual([]);
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.locator(".quick-next-step")).toHaveText(nextStep);
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const first = await savedRecords(page);
  expect(first).toHaveLength(1);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    firstAnswer,
  );
  const secondAnswer = `${firstAnswer}\nMy cobalt project example makes the sequence clearer.`;
  await page.getByLabel("Your answer", { exact: true }).fill(secondAnswer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Saved answers (2)", exact: true })
    .click();
  await page.getByLabel("Search saved answers", { exact: true }).fill("cobalt");
  await expect(page.locator(".quick-history-list > button")).toHaveCount(1);
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator("#saved-answer-detail")).toBeFocused();
  await expect(page.locator(".saved-answer")).toHaveText(secondAnswer);
  await page
    .getByText("Compare with an earlier answer", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Earlier saved answer", exact: true }),
  ).toHaveText(firstAnswer);
  await expect(
    page.getByRole("region", { name: "Selected saved answer", exact: true }),
  ).toHaveText(secondAnswer);
  const exported = await downloadText(page, "Export review");
  expect(exported).toContain(question);
  expect(exported).toContain(secondAnswer);
  const after = await savedRecords(page);
  expect(after).toHaveLength(2);
  expect(
    new Set(after.map((record: { data: { id: string } }) => record.data.id))
      .size,
  ).toBe(2);
  expect(
    after.find(
      (record: { data: { id: string } }) => record.data.id === first[0].data.id,
    ).data.answer,
  ).toBe(firstAnswer);
});

test("a narrow viewport preserves answer, profile and story drafts across modes and local export", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await expect(
    page.getByRole("button", { name: "Start practicing", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  const another = page.getByRole("button", {
    name: "Try another question",
    exact: true,
  });
  await another.focus();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await expect(page.locator(".quick-question")).toHaveText(question);
  await tab(page, "Role & resume");
  await page.getByLabel("Role", { exact: true }).fill("Synthetic role draft");
  await tab(page, "Story library");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await page
    .getByLabel("Story title", { exact: true })
    .fill("Synthetic story draft");
  await page
    .getByLabel("S · Situation", { exact: true })
    .fill("An unfinished example.");
  await quickMode(page);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await tab(page, "Progress");
  const exported = JSON.parse(await downloadText(page, "Export workspace"));
  expect(exported.exportInfo).toMatchObject({
    savedWorkspaceAvailable: true,
    profileHasUnsavedChanges: true,
  });
  expect(exported.profile.role).toBe("Synthetic role draft");
  expect(exported.drafts.story).toMatchObject({
    title: "Synthetic story draft",
    situation: "An unfinished example.",
  });
  expect(exported.drafts.practice).toMatchObject({
    question,
    answer,
    saveState: "unsaved",
  });
  expect(exported.sessions).toEqual([]);
  expect(exported.stories).toEqual([]);
  expect(await savedRecords(page)).toEqual([]);
  await tab(page, "Role & resume");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "Synthetic role draft",
  );
  await tab(page, "Story library");
  await expect(page.getByLabel("Story title", { exact: true })).toHaveValue(
    "Synthetic story draft",
  );
  await quickMode(page);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your next practice step.",
      exact: true,
    }),
  ).toBeFocused();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const records = await savedRecords(page);
  expect(records).toHaveLength(1);
  expect(records[0].data.answer).toBe(answer);
});

test("an interrupted save acknowledgement recovers through a mode switch and one same-record retry", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("A local test origin is required.");
  const origin = new URL(baseURL).origin;
  await openQuickWorkspace(page);
  const ids: string[] = [];
  await page.route("**/api/workspace", async (route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    if (route.request().method() === "POST") {
      ids.push(route.request().postDataJSON().data.id);
      if (ids.length === 1) {
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        return route.fulfill({ response: committed, json: {} });
      }
    }
    return route.fallback();
  });
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toContainText(
    "Save not confirmed",
  );
  const committed = await savedRecords(page);
  expect(committed).toHaveLength(1);
  await advancedWorkspace(page);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await quickMode(page);
  await expect(page.locator(".quick-saved")).toContainText(
    "Save not confirmed",
  );
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(ids).toEqual([committed[0].data.id, committed[0].data.id]);
  const saved = await savedRecords(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].data.answer).toBe(answer);
  await page.reload();
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator(".saved-answer")).toHaveText(answer);
});
