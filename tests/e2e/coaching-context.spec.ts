import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openWorkspace,
  tab,
} from "./fixtures";
import { emptyProfile } from "../../lib/interview";

const profileChoice = (page: Page) =>
  page.getByLabel("Include my role, company, resume and job description", {
    exact: true,
  });
const storyChoice = (page: Page) =>
  page.getByLabel("Include up to five saved stories", { exact: true });
const contents = (page: Page) =>
  page.getByRole("region", { name: "AI request contents" });
async function enableAI(page: Page) {
  await tab(page, "Research & settings");
  await page.getByLabel("Enable optional AI coaching", { exact: true }).check();
  await tab(page, "Practice room");
}
async function mockCoach(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("A local test origin is required.");
  const origin = new URL(baseURL).origin;
  const requests: Array<{
    question: string;
    answer: string;
    category: string;
    profile: typeof emptyProfile;
    stories: Array<Record<string, string>>;
  }> = [];
  // Override the fail-closed fixture only for our same-origin synthetic response.
  // No browser request reaches an external provider or requires a credential.
  await page.route("**/api/coach", async (route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    if (route.request().method() === "GET")
      return route.fulfill({ json: { available: true } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: { text: `Synthetic coaching response ${requests.length}` },
    });
  });
  return requests;
}
async function seedContext(page: Page) {
  const profile = {
    role: "Synthetic engineer",
    company: "Example company",
    resume: "Private synthetic experience notes\nSecond line",
    job: "Private synthetic role requirements",
  };
  expect(
    (
      await page.request.post("/api/workspace", {
        data: { kind: "profile", data: profile },
      })
    ).ok(),
  ).toBeTruthy();
  for (let i = 0; i < 6; i++) {
    expect(
      (
        await page.request.post("/api/workspace", {
          data: {
            kind: "story",
            data: {
              id: randomUUID(),
              tag: "Leadership",
              title: `Synthetic story ${i}`,
              situation: `Private situation ${i}`,
              task: `Task ${i}`,
              action: `Action ${i}`,
              result: `Result ${i}`,
            },
          },
        })
      ).ok(),
    ).toBeTruthy();
  }
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  return {
    profile,
    before,
    stories: before
      .filter((r: { kind: string }) => r.kind === "story")
      .map((r: { data: Record<string, string> }) => r.data),
  };
}
async function requestCoaching(page: Page, number: number) {
  await page
    .getByRole("button", { name: "Get AI coaching", exact: true })
    .click();
  await expect(page.locator(".ai-feedback")).toContainText(
    `Synthetic coaching response ${number}`,
  );
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("AI excludes profile and stories by default and shows the request before sending", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seeded = await seedContext(page);
  const requests = await mockCoach(page, baseURL);
  await openWorkspace(page);
  await enableAI(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await expect(profileChoice(page)).not.toBeChecked();
  await expect(storyChoice(page)).not.toBeChecked();
  const summary = page.getByText("Review request contents", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(summary).toBeFocused();
  await expect(contents(page)).toContainText(answer);
  await expect(contents(page)).toContainText(
    "Profile fields are not included.",
  );
  await expect(contents(page)).toContainText("Saved stories are not included.");
  await expect(contents(page)).not.toContainText(seeded.profile.resume);
  expect(requests).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await requestCoaching(page, 1);
  expect(requests[0]).toMatchObject({
    answer,
    profile: emptyProfile,
    stories: [],
  });
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(seeded.before);
});

test("each context choice sends only its disclosed fields and the preview follows unsaved profile edits", async ({
  page,
  baseURL,
}) => {
  const seeded = await seedContext(page);
  const requests = await mockCoach(page, baseURL);
  await openWorkspace(page);
  await enableAI(page);
  await tab(page, "Role & resume");
  await page.getByLabel("Role", { exact: true }).fill("Unsaved synthetic role");
  await tab(page, "Practice room");
  await profileChoice(page).check();
  await page.getByText("Review request contents", { exact: true }).click();
  await expect(contents(page)).toContainText("Unsaved synthetic role");
  await expect(contents(page)).toContainText(seeded.profile.resume);
  await expect(contents(page)).toContainText("Saved stories are not included.");
  await requestCoaching(page, 1);
  expect(requests[0].profile).toEqual({
    ...seeded.profile,
    role: "Unsaved synthetic role",
  });
  expect(requests[0].stories).toEqual([]);
  await profileChoice(page).uncheck();
  await storyChoice(page).check();
  for (const story of seeded.stories.slice(0, 5))
    await expect(contents(page)).toContainText(story.title);
  await expect(contents(page)).not.toContainText(seeded.stories[5].title);
  await expect(contents(page)).not.toContainText(seeded.profile.resume);
  await requestCoaching(page, 2);
  expect(requests[1].profile).toEqual(emptyProfile);
  expect(requests[1].stories).toEqual(
    seeded.stories
      .slice(0, 5)
      .map(
        ({
          title,
          situation,
          task,
          action,
          result,
        }: Record<string, string>) => ({
          title,
          situation,
          task,
          action,
          result,
        }),
      ),
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(seeded.before);
});

test("turning AI off clears context choices and enabling or previewing never sends a request", async ({
  page,
  baseURL,
}) => {
  await seedContext(page);
  const requests = await mockCoach(page, baseURL);
  await openWorkspace(page);
  await enableAI(page);
  await profileChoice(page).check();
  await storyChoice(page).check();
  await tab(page, "Research & settings");
  await page
    .getByLabel("Enable optional AI coaching", { exact: true })
    .uncheck();
  await page.getByLabel("Enable optional AI coaching", { exact: true }).check();
  await tab(page, "Practice room");
  await expect(profileChoice(page)).not.toBeChecked();
  await expect(storyChoice(page)).not.toBeChecked();
  await profileChoice(page).check();
  await page.reload();
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
  await enableAI(page);
  await expect(profileChoice(page)).not.toBeChecked();
  await expect(storyChoice(page)).not.toBeChecked();
  await page.getByText("Review request contents", { exact: true }).click();
  expect(requests).toHaveLength(0);
});

test("an empty story library cannot be opted in, and question-only coaching stays available", async ({
  page,
  baseURL,
}) => {
  const requests = await mockCoach(page, baseURL);
  await openWorkspace(page);
  await enableAI(page);
  await expect(storyChoice(page)).toBeDisabled();
  await expect(
    page.getByText("No saved stories to include.", { exact: true }),
  ).toBeVisible();
  await page.getByText("Review request contents", { exact: true }).click();
  await expect(contents(page)).toContainText(
    "No answer yet; coaching will use the question.",
  );
  await requestCoaching(page, 1);
  expect(requests[0]).toMatchObject({
    answer: "",
    profile: emptyProfile,
    stories: [],
  });
  expect(requests[0].question.length).toBeGreaterThan(0);
});

test("pending coaching freezes context choices and turning AI off ignores its late response", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("A local test origin is required.");
  const origin = new URL(baseURL).origin;
  await seedContext(page);
  let release!: () => void;
  let finished!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const replied = new Promise<void>((resolve) => {
    finished = resolve;
  });
  let sent = 0;
  await page.route("**/api/coach", async (route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    if (route.request().method() === "GET")
      return route.fulfill({ json: { available: true } });
    sent++;
    await waiting;
    try {
      await route.fulfill({
        json: { text: "Late synthetic response that must be ignored" },
      });
    } finally {
      finished();
    }
  });
  await openWorkspace(page);
  await enableAI(page);
  await profileChoice(page).check();
  await storyChoice(page).check();
  try {
    await page
      .getByRole("button", { name: "Get AI coaching", exact: true })
      .click();
    await expect.poll(() => sent).toBe(1);
    await expect(profileChoice(page)).toBeDisabled();
    await expect(storyChoice(page)).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Thinking…", exact: true }),
    ).toBeDisabled();
    await tab(page, "Research & settings");
    await page
      .getByLabel("Enable optional AI coaching", { exact: true })
      .uncheck();
    release();
    await replied;
    await enableAI(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(profileChoice(page)).not.toBeChecked();
    await expect(storyChoice(page)).not.toBeChecked();
    await expect(profileChoice(page)).toBeEnabled();
    await expect(page.locator(".ai-feedback")).toHaveCount(0);
    expect(sent).toBe(1);
  } finally {
    release();
  }
});
