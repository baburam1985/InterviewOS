import type { Page } from "@playwright/test";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
} from "./fixtures";

async function savedRecords(page: Page) {
  return (await (await page.request.get("/api/workspace")).json()).records;
}
async function saveFirstAnswer(page: Page) {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  return (await savedRecords(page))[0].data;
}
async function recheckSignIn(page: Page) {
  await expect(
    page.getByRole("alert", { name: "Sign-in required" }),
  ).toBeVisible();
  expect(
    (await page.request.get("/signin-with-chatgpt?return_to=/")).ok(),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Check sign-in", exact: true })
    .click();
  await expect(
    page.getByRole("alert", { name: "Sign-in required" }),
  ).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("a refreshed external revision keeps this tab's edits separate and preserves both on explicit save", async ({
  page,
}) => {
  const first = await saveFirstAnswer(page);
  await advancedWorkspace(page);
  const local = answer + " This is my still-open local revision.";
  await page.getByLabel("Your answer", { exact: true }).fill(local);
  const external = answer + " This version was saved from another tab.";
  const response = await page.request.post("/api/workspace", {
    data: { kind: "session", data: { ...first, answer: external } },
  });
  expect(response.ok()).toBeTruthy();
  const otherSaved = (await response.json()).data;
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await recheckSignIn(page);
  await expect(page.getByRole("status")).toContainText(
    "Your current answer is kept as a separate draft",
  );
  await expect(page.getByRole("status")).toContainText(
    "Saving it will create another history entry",
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    local,
  );
  expect(await savedRecords(page)).toEqual([
    { kind: "session", data: otherSaved },
  ]);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator(".quick-answer-detail .saved-answer")).toHaveText(
    external,
  );
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const records = await savedRecords(page);
  expect(records).toHaveLength(2);
  expect(
    records.find((r: { data: { id: string } }) => r.data.id === first.id).data,
  ).toEqual(otherSaved);
  const own = records.find(
    (r: { data: { id: string } }) => r.data.id !== first.id,
  ).data;
  expect(own.answer).toBe(local);
  await advancedWorkspace(page);
  await page
    .getByRole("button", { name: "Update review", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Answer and review saved",
  );
  expect(await savedRecords(page)).toHaveLength(2);
});

test("a committed update with a lost reply still retries the same record after reloading", async ({
  page,
}) => {
  const first = await saveFirstAnswer(page);
  await advancedWorkspace(page);
  const edited =
    answer + " This update committed before its acknowledgement was lost.";
  await page.getByLabel("Your answer", { exact: true }).fill(edited);
  const ids: string[] = [];
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") {
      ids.push(route.request().postDataJSON().data.id);
      if (ids.length === 1) {
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic lost acknowledgement" },
        });
      }
    }
    await route.fallback();
  });
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic lost acknowledgement",
  );
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await recheckSignIn(page);
  await expect(page.getByText(/A saved answer changed since/)).toHaveCount(0);
  expect((await savedRecords(page))[0].data.answer).toBe(edited);
  expect(await savedRecords(page)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toContainText(
    "Save not confirmed",
  );
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(ids).toEqual([first.id, first.id, first.id]);
  expect(await savedRecords(page)).toHaveLength(1);
});

test("an unchanged saved answer keeps its saved state and update identity after a successful recheck", async ({
  page,
}) => {
  const first = await saveFirstAnswer(page);
  await advancedWorkspace(page);
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Update review", exact: true })
    .click();
  await recheckSignIn(page);
  await expect(page.getByText(/A saved answer changed since/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Update review", exact: true }),
  ).toBeEnabled();
  expect(await savedRecords(page)).toEqual([{ kind: "session", data: first }]);
  await page
    .getByRole("button", { name: "Update review", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Answer and review saved",
  );
  const records = await savedRecords(page);
  expect(records).toHaveLength(1);
  expect(records[0].data.id).toBe(first.id);
  expect(records[0].data.answer).toBe(answer);
});

test("an earlier unconfirmed update stays recognizable after a different later attempt fails", async ({
  page,
}) => {
  const first = await saveFirstAnswer(page);
  await advancedWorkspace(page);
  const committedText =
    answer + " This intermediate edit committed with no reply.";
  const latestText =
    answer + " These are my latest local edits after that failure.";
  const ids: string[] = [];
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") {
      ids.push(route.request().postDataJSON().data.id);
      if (ids.length === 1) {
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic lost intermediate reply" },
        });
      }
    }
    await route.fallback();
  });
  await page.getByLabel("Your answer", { exact: true }).fill(committedText);
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic lost intermediate reply",
  );
  await page.getByLabel("Your answer", { exact: true }).fill(latestText);
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await recheckSignIn(page);
  await expect(page.getByText(/A saved answer changed since/)).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    latestText,
  );
  expect(await savedRecords(page)).toHaveLength(1);
  expect((await savedRecords(page))[0].data.answer).toBe(committedText);
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Answer and review saved",
  );
  expect(ids).toEqual([first.id, first.id, first.id]);
  const saved = await savedRecords(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].data.id).toBe(first.id);
  expect(saved[0].data.answer).toBe(latestText);
});
