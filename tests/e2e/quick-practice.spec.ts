import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
  tab,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("quick practice is the default and retry creates a distinct saved attempt", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await expect(
    page.getByRole("button", { name: "Quick practice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("radiogroup", { name: "Practice goal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /Introduce myself/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Role & resume", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Get AI coaching", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await expect(
    page.getByRole("button", { name: "Get feedback", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Here’s your next improvement." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "One thing to try", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const improvement = await page.locator(".quick-next-step").innerText();
  expect(improvement.trim().length).toBeGreaterThan(10);
  const first = await (await page.request.get("/api/workspace")).json();
  expect(first.records).toHaveLength(1);
  expect(first.records[0].kind).toBe("session");
  expect(first.records[0].data.category).toBe("Recruiter");
  await expect(page.locator(".review")).not.toBeVisible();
  await page.getByText("See detailed feedback", { exact: true }).click();
  await expect(page.locator(".review")).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await expect(page.locator(".quick-focus")).toContainText(improvement);
  const secondAnswer = `${answer} My testing experience matches this role, and I am interested in building reliable customer products.`;
  await page.getByLabel("Your answer", { exact: true }).fill(secondAnswer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const second = await (await page.request.get("/api/workspace")).json();
  expect(second.records).toHaveLength(2);
  expect(
    new Set(
      second.records.map((record: { data: { id: string } }) => record.data.id),
    ).size,
  ).toBe(2);
  expect(
    second.records.map(
      (record: { data: { answer: string } }) => record.data.answer,
    ),
  ).toEqual(expect.arrayContaining([answer, secondAnswer]));
  await page
    .getByRole("button", { name: "Saved answers (2)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your saved answers." }),
  ).toBeVisible();
  await expect(page.locator(".quick-history-list > button")).toHaveCount(2);
});

test("mode switches preserve an unsaved draft and its later saved review", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page.getByRole("radio", { name: /Tell a work story/ }).check();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await advancedWorkspace(page);
  await expect(page.locator(".practice h2")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const improvement = await page.locator(".quick-next-step").innerText();
  await advancedWorkspace(page);
  await expect(page.locator(".review")).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await expect(
    page.getByRole("button", { name: "Update review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Here’s your next improvement." }),
  ).toBeVisible();
  await expect(page.locator(".quick-next-step")).toHaveText(improvement);
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(1);
});

test("saved technical questions retry in the right category across both modes", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page.getByRole("radio", { name: /Explain a solution/ }).check();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  const solution =
    "Clarify input requirements. Use a hash map to find each complement in O(n) time and O(n) space. Test empty input, duplicate numbers, and missing solutions.";
  await page.getByLabel("Your answer", { exact: true }).fill(solution);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await page
    .getByRole("button", { name: "Practice this question again", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    solution,
  );
  await advancedWorkspace(page);
  await expect(
    page.getByRole("heading", { name: "Show your thinking." }),
  ).toBeVisible();
  await expect(page.getByLabel("Your solution & explanation")).toHaveValue(
    solution,
  );
  await expect(page.locator(".practice h2")).toHaveText(question);
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
  await tab(page, "Progress");
  await expect(page.locator(".history-row")).toHaveCount(2);
  await page.locator(".history-row").first().click();
  await page
    .getByRole("button", { name: "Practice this question again", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Show your thinking." }),
  ).toBeVisible();
  await expect(page.getByLabel("Your solution & explanation")).toHaveValue(
    solution,
  );
});

test("profile, stories, and saved answers remain shared across workspace modes", async ({
  page,
}) => {
  const profile = {
    role: "Synthetic QA lead",
    company: "Example Test",
    resume: "Synthetic resume notes",
    job: "Test reliability",
  };
  const story = {
    id: randomUUID(),
    title: "Shared synthetic story",
    tag: "Impact",
    situation: "A launch",
    task: "Own tests",
    action: "Analyze risks",
    result: "Reduced failures",
  };
  for (const record of [
    { kind: "profile", data: profile },
    { kind: "story", data: story },
  ]) {
    expect(
      (await page.request.post("/api/workspace", { data: record })).ok(),
    ).toBeTruthy();
  }
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  await tab(page, "Role & resume");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    profile.role,
  );
  await expect(page.getByLabel("Resume or experience notes")).toHaveValue(
    profile.resume,
  );
  await tab(page, "Story library");
  await expect(
    page.getByRole("heading", { name: story.title, exact: true }),
  ).toBeVisible();
  await tab(page, "Progress");
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your saved answers." }),
  ).toBeVisible();
  await expect(page.locator(".quick-history-list > button")).toHaveCount(1);
  const records = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(records).toHaveLength(3);
  expect(records).toEqual(
    expect.arrayContaining([
      { kind: "profile", data: profile },
      { kind: "story", data: story },
    ]),
  );
});

test("guest quick feedback is useful and accurately marked unsaved", async ({
  page,
}) => {
  await page.context().clearCookies();
  await openQuickWorkspace(page);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One thing to try", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await expect(
    page.getByText("Saved to your history", { exact: true }),
  ).toHaveCount(0);
  await page.getByText("Your question and answer", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export answer", exact: true })
    .click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toContain(answer);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});

test("quick phone layout keeps goals, feedback, history, and mode navigation reachable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  async function fits(stage: string) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${stage} has no horizontal overflow`,
    ).toBeTruthy();
    for (const label of ["Quick practice", "Advanced workspace"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      const bounds = await button.boundingBox();
      expect(bounds, `${label} remains visible`).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    }
  }
  await fits("welcome");
  await page.screenshot({
    path: testInfo.outputPath("quick-phone-welcome.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await fits("answer editor");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  await fits("feedback");
  await page.screenshot({
    path: testInfo.outputPath("quick-phone-feedback.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await fits("saved history");
  await advancedWorkspace(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your saved answers." }),
  ).toBeVisible();
});

test("a failed quick save retains feedback and retries the same record once", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  const attemptedIds: string[] = [];
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") {
      attemptedIds.push(route.request().postDataJSON().data.id);
      if (attemptedIds.length === 1) {
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic temporary save failure. Please retry." },
        });
      }
    }
    await route.fallback();
  });
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic temporary save failure",
  );
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await expect(
    page.getByRole("heading", { name: "One thing to try", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(attemptedIds).toHaveLength(2);
  expect(attemptedIds[0]).toBe(attemptedIds[1]);
  const records = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(records).toHaveLength(1);
  expect(records[0].data.answer).toBe(answer);
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toHaveCount(0);
});

test("changing goals can cancel replacement and resume the current draft", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Change goal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume current answer", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Explain a solution/ }).check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume current answer", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page.getByRole("button", { name: "Change goal", exact: true }).click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page.getByRole("button", { name: "Change goal", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await expect(page.locator(".quick-question")).not.toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEmpty();
});
