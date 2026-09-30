import { readFile } from "node:fs/promises";
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

async function exportFile(page: Page, name = "Export workspace") {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("interviewos-export.json");
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("guest export keeps all open answer, story and profile drafts without saving or clearing them", async ({
  page,
}) => {
  await page.context().clearCookies();
  let writes = 0;
  page.on("request", (request) => {
    if (["POST", "DELETE"].includes(request.method())) writes++;
  });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  const draft = `  ${answer}\nPreserve this exact spacing. 😀`;
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  await tab(page, "Role & resume");
  await page.getByLabel("Role", { exact: true }).fill("Synthetic engineer");
  await page
    .getByLabel("Resume or experience notes", { exact: true })
    .fill("Synthetic notes\nLine two");
  await tab(page, "Story library");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await page
    .getByLabel("Story title", { exact: true })
    .fill("Unfinished synthetic story");
  await page
    .getByLabel("A · Action", { exact: true })
    .fill("I tested an early idea.");
  // Recovery notices provide a download before leaving for sign-in.
  const recovered = await exportFile(page, "Export open work");
  expect(recovered.exportInfo.savedWorkspaceAvailable).toBe(false);
  expect(recovered.exportInfo.profileHasUnsavedChanges).toBe(true);
  expect(recovered.profile.role).toBe("Synthetic engineer");
  expect(recovered.profile.resume).toBe("Synthetic notes\nLine two");
  expect(recovered.drafts.story.title).toBe("Unfinished synthetic story");
  expect(recovered.drafts.story.action).toBe("I tested an early idea.");
  expect(recovered.drafts.practice).toMatchObject({
    question,
    answer: draft,
    saveState: "unsaved",
    review: null,
  });
  expect(recovered.sessions).toEqual([]);
  expect(recovered.stories).toEqual([]);
  await expect(page.getByLabel("Story title", { exact: true })).toHaveValue(
    "Unfinished synthetic story",
  );
  await tab(page, "Progress");
  await expect(page.locator(".workspace-export-help")).toContainText(
    "this export may be incomplete",
  );
  await expect(page.locator(".workspace-export-help")).toContainText(
    "automatic import is not available",
  );
  const exported = await exportFile(page);
  expect(exported.drafts).toEqual(recovered.drafts);
  expect(exported.profile).toEqual(recovered.profile);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    draft,
  );
  expect(writes).toBe(0);
});

test("export separates saved stories and answers from edited story and unconfirmed answer drafts", async ({
  page,
}) => {
  const story = {
    id: randomUUID(),
    title: "Saved synthetic story",
    tag: "Leadership",
    situation: "An earlier project",
    task: "",
    action: "An earlier action",
    result: "A saved result",
  };
  expect(
    (
      await page.request.post("/api/workspace", {
        data: { kind: "story", data: story },
      })
    ).ok(),
  ).toBeTruthy();
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const revision = answer + " This revised part is not confirmed saved.";
  await page.getByLabel("Your answer", { exact: true }).fill(revision);
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic save interruption" },
      });
    await route.fallback();
  });
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toContainText(
    "Save not confirmed",
  );
  await tab(page, "Story library");
  await page.getByRole("button", { name: "Edit story", exact: true }).click();
  await page
    .getByLabel("Story title", { exact: true })
    .fill("Edited unsaved title");
  await tab(page, "Progress");
  const exported = await exportFile(page);
  expect(exported.exportInfo.savedWorkspaceAvailable).toBe(true);
  expect(exported.stories).toEqual([story]);
  expect(exported.sessions).toEqual(
    before
      .filter((r: { kind: string }) => r.kind === "session")
      .map((r: { data: unknown }) => r.data),
  );
  expect(exported.drafts.story).toEqual({
    ...story,
    title: "Edited unsaved title",
  });
  expect(exported.drafts.practice).toMatchObject({
    answer: revision,
    saveState: "unconfirmed",
  });
  expect(exported.drafts.practice.review).toBeTruthy();
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
});

test("a draft-only story enables export and a failed load labels unavailable saved data honestly", async ({
  page,
}) => {
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Synthetic unavailable workspace" },
    }),
  );
  await openQuickWorkspace(page);
  await tab(page, "Story library");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  // An incomplete story is still work worth keeping, even without a title.
  await page
    .getByLabel("S · Situation", { exact: true })
    .fill("Only this unfinished situation exists.");
  const recovered = await exportFile(page, "Export open work");
  expect(recovered.drafts.story.title).toBe("");
  expect(recovered.drafts.story.situation).toBe(
    "Only this unfinished situation exists.",
  );
  expect(recovered.exportInfo.savedWorkspaceAvailable).toBe(false);
  expect(recovered.exportInfo.scope).toContain(
    "Unavailable server data is not included",
  );
  await tab(page, "Progress");
  await expect(
    page.getByRole("button", { name: "Export workspace", exact: true }),
  ).toBeEnabled();
  const exported = await exportFile(page);
  expect(exported.drafts).toEqual(recovered.drafts);
  expect(exported.drafts.practice).toBeNull();
});

test("an answer-only workspace can export before its first review or save", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await tab(page, "Progress");
  await expect(
    page.getByRole("button", { name: "Export workspace", exact: true }),
  ).toBeEnabled();
  const exported = await exportFile(page);
  expect(exported.drafts.practice).toMatchObject({
    question,
    answer,
    review: null,
    saveState: "unsaved",
  });
  expect(exported.drafts.story).toBeNull();
  expect(exported.exportInfo.profileHasUnsavedChanges).toBe(false);
  expect(exported.exportInfo.savedWorkspaceAvailable).toBe(true);
  expect(exported.stories).toEqual([]);
  expect(exported.sessions).toEqual([]);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual([]);
});

test("a retained answer deleted from refreshed history becomes exportable as an unconfirmed draft", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const saved = (await (await page.request.get("/api/workspace")).json())
    .records[0];
  expect(
    (
      await page.request.delete(
        `/api/workspace?id=${saved.data.id}&kind=session`,
      )
    ).ok(),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await tab(page, "Practice room");
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Update review", exact: true })
    .click();
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
  await tab(page, "Progress");
  await expect(page.locator(".history-row")).toHaveCount(0);
  const exported = await exportFile(page);
  expect(exported.sessions).toEqual([]);
  expect(exported.drafts.practice).toMatchObject({
    answer,
    saveState: "unconfirmed",
  });
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your first answer starts here.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.locator(".quick-saved")).toContainText(
    "Save not confirmed",
  );
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toBeEnabled();
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual([]);
});
