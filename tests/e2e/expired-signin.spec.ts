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

const signInNotice = (page: Page) =>
  page.getByRole("alert", { name: "Sign-in required" });
const checkSignIn = (page: Page) =>
  page.getByRole("button", { name: "Check sign-in", exact: true });
async function signInElsewhere(page: Page) {
  const response = await page.request.get("/signin-with-chatgpt?return_to=/");
  expect(response.ok()).toBeTruthy();
}
async function records(page: Page) {
  return (await (await page.request.get("/api/workspace")).json()).records;
}
async function seedAnswer(page: Page) {
  const response = await page.request.post("/api/workspace", {
    data: {
      kind: "session",
      data: {
        id: randomUUID(),
        question: "What did you learn from your earlier project?",
        category: "Behavioral",
        answer,
        seconds: 0,
        createdAt: new Date().toISOString(),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("expired sign-in reveals recovery, retains history and retries the same answer only after a valid reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const previous = await seedAnswer(page);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  const ids: string[] = [];
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST")
      ids.push(route.request().postDataJSON().data.id);
    await route.fallback();
  });
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(signInNotice(page)).toBeFocused();
  await expect(signInNotice(page)).toBeInViewport({ ratio: 1 });
  await expect(
    signInNotice(page).getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Saved answers (1)", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quick-saved")).toContainText(
    "Save not confirmed",
  );
  await checkSignIn(page).click();
  await expect(checkSignIn(page)).toBeEnabled();
  await expect(signInNotice(page)).toBeVisible();
  expect(ids).toHaveLength(1);

  // A failed recheck must not imply sign-in returned or unlock saving.
  await page.route(
    "**/api/workspace",
    async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic connection interruption" },
        });
      await route.fallback();
    },
    { times: 1 },
  );
  await checkSignIn(page).click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic connection interruption",
  );
  await expect(signInNotice(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toHaveCount(0);

  await signInElsewhere(page);
  await checkSignIn(page).click();
  await expect(signInNotice(page)).toHaveCount(0);
  expect(await records(page)).toEqual([{ kind: "session", data: previous }]);
  await page.getByText("Your question and answer", { exact: true }).click();
  await expect(page.locator(".quick-feedback .saved-answer")).toHaveText(
    answer,
  );
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  const saved = await records(page);
  expect(saved).toHaveLength(2);
  expect(
    saved.find((r: { data: { id: string } }) => r.data.id === previous.id).data,
  ).toEqual(previous);
  expect(
    saved.find((r: { data: { id: string } }) => r.data.id === ids[0]).data
      .answer,
  ).toBe(answer);
});

test("sign-in after an expired save offers explicit answer recovery without automatic saving", async ({
  page,
}) => {
  const previous = await seedAnswer(page);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(signInNotice(page)).toBeVisible();
  const nextStep = await page.locator(".quick-next-step").innerText();
  await signInNotice(page)
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  const recovery = page.getByRole("region", {
    name: "Resume practice after sign-in",
  });
  await expect(recovery).toBeVisible();
  expect(await records(page)).toEqual([{ kind: "session", data: previous }]);
  await recovery
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.locator(".quick-next-step")).toHaveText(nextStep);
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await page.getByText("Your question and answer", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: question, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quick-feedback .saved-answer")).toHaveText(
    answer,
  );
  expect(await records(page)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(await records(page)).toHaveLength(2);
});

for (const kind of ["profile", "story"] as const) {
  test(`an expired ${kind} save keeps edited fields through a successful sign-in recheck`, async ({
    page,
  }) => {
    await openQuickWorkspace(page);
    await tab(page, kind === "profile" ? "Role & resume" : "Story library");
    if (kind === "story")
      await page
        .getByRole("button", { name: "New story", exact: true })
        .click();
    const field = page.getByLabel(kind === "profile" ? "Role" : "Story title", {
      exact: true,
    });
    const value =
      kind === "profile"
        ? "Synthetic reliability engineer"
        : "Synthetic recovery project";
    await field.fill(value);
    const save = page.getByRole("button", {
      name: `Save ${kind}`,
      exact: true,
    });
    await page.context().clearCookies();
    await save.click();
    await expect(signInNotice(page)).toBeFocused();
    await expect(field).toHaveValue(value);
    await expect(save).toBeDisabled();
    await checkSignIn(page).click();
    await expect(checkSignIn(page)).toBeEnabled();
    await expect(field).toHaveValue(value);
    await expect(save).toBeDisabled();
    await signInElsewhere(page);
    await checkSignIn(page).click();
    await expect(signInNotice(page)).toHaveCount(0);
    await expect(field).toHaveValue(value);
    await expect(save).toBeEnabled();
    expect(await records(page)).toHaveLength(0);
    await save.click();
    await expect(page.getByRole("status")).toContainText(
      kind === "profile" ? "Role and resume saved." : "Story saved.",
    );
    const saved = await records(page);
    expect(saved).toHaveLength(1);
    expect(saved[0].data[kind === "profile" ? "role" : "title"]).toBe(value);
  });
}

test("an expired deletion retains its answer and requires explicit retry after sign-in returns", async ({
  page,
}) => {
  const previous = await seedAnswer(page);
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await page.context().clearCookies();
  page.once("dialog", (dialog) => dialog.accept());
  const remove = page.getByRole("button", {
    name: "Delete answer",
    exact: true,
  });
  await remove.click();
  await expect(signInNotice(page)).toBeFocused();
  await expect(page.locator(".quick-answer-detail .saved-answer")).toHaveText(
    answer,
  );
  await expect(remove).toBeDisabled();
  await signInElsewhere(page);
  await checkSignIn(page).click();
  await expect(signInNotice(page)).toHaveCount(0);
  expect(await records(page)).toEqual([{ kind: "session", data: previous }]);
  await expect(remove).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await remove.click();
  await expect(
    page.getByRole("heading", {
      name: "Your first answer starts here.",
      exact: true,
    }),
  ).toBeVisible();
  expect(await records(page)).toHaveLength(0);
});

test("a non-authentication save error keeps ordinary retry available", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 403,
        json: { error: "Synthetic rejected request" },
      });
    await route.fallback();
  });
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic rejected request",
  );
  await expect(signInNotice(page)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toBeEnabled();
});

test("sign-in recheck waits for an in-progress resume import and preserves its completed text", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await tab(page, "Role & resume");
  await page.getByLabel("Role", { exact: true }).fill("Synthetic engineer");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(signInNotice(page)).toBeVisible();
  await signInElsewhere(page);
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function () {
      await new Promise<void>((resolve) => {
        (window as typeof window & { finishImport: () => void }).finishImport =
          resolve;
      });
      return original.call(this);
    };
  });
  const resume =
    "Synthetic imported experience: I improved reliability across three releases.";
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-experience.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(resume),
  });
  await expect(checkSignIn(page)).toBeDisabled();
  await expect(
    page.getByLabel("Resume or experience notes", { exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    (window as typeof window & { finishImport: () => void }).finishImport(),
  );
  await expect(checkSignIn(page)).toBeEnabled();
  await expect(
    page.getByLabel("Resume or experience notes", { exact: true }),
  ).toHaveValue(resume);
  await checkSignIn(page).click();
  await expect(signInNotice(page)).toHaveCount(0);
  await expect(
    page.getByLabel("Resume or experience notes", { exact: true }),
  ).toHaveValue(resume);
  expect(await records(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Role and resume saved.",
  );
  expect((await records(page))[0].data.resume).toBe(resume);
});
