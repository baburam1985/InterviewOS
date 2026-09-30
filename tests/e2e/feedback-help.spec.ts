import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("guest feedback offers optional keyboard-accessible help without replacing the answer", async ({
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
  const draft =
    "During a project the team had unclear goals. First we tested a prototype because it reduced failures by 20 percent.";
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await expect(page.locator(".quick-next-step")).toContainText(
    "your responsibility",
  );
  const help = page.locator(".feedback-help");
  const summary = help.locator("summary");
  await expect(help).not.toHaveAttribute("open");
  await expect(help.locator(".feedback-help-prompt")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(help).toHaveAttribute("open");
  await expect(
    help.getByRole("heading", { name: "Sentence starter", exact: true }),
  ).toBeVisible();
  await expect(help.locator(".feedback-help-prompt")).toContainText(
    "I was responsible for [your part]",
  );
  await expect(help).toContainText("your own real details");
  await expect(summary).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    draft,
  );
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(draft + " I owned the test plan.");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-next-step")).toContainText(
    "beyond a few sentences",
  );
  await expect(help).not.toHaveAttribute("open");
  await summary.click();
  await expect(
    help.getByRole("heading", { name: "Editing prompt", exact: true }),
  ).toBeVisible();
  await expect(help.locator(".feedback-help-prompt")).not.toContainText(
    "I was responsible",
  );
  expect(posts).toBe(0);
});

test("technical help stays grounded in the selected review and opening it leaves saved work unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await page.getByRole("radio", { name: /Explain a solution/ }).check();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const draft =
    "My approach uses a cache. We compare time complexity and test duplicate keys.";
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  const question = await page.locator(".quick-question").innerText();
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  await page.getByText("Help me with this step", { exact: true }).click();
  const prompt = await page.locator(".feedback-help-prompt").innerText();
  expect(prompt).toContain("[what the solution receives]");
  expect(prompt).toContain("[a constraint to confirm]");
  await expect(page.locator(".feedback-help")).toContainText(
    "Label hypothetical scenarios clearly",
  );
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator(".feedback-help")).not.toHaveAttribute("open");
  await page.getByText("Help me with this step", { exact: true }).click();
  await expect(page.locator(".feedback-help-prompt")).toHaveText(prompt);
  await expect(page.locator(".quick-answer-detail .saved-answer")).toHaveText(
    draft,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Practice this question again", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    draft,
  );
  await expect(page.locator(".quick-question")).toHaveText(question);
  await advancedWorkspace(page);
  await expect(page.getByLabel("Your solution & explanation")).toHaveValue(
    draft,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
});

test("all-pass feedback gives a rehearsal prompt without inventing another missing requirement", async ({
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
  await expect(page.locator(".quick-feedback-reason")).toContainText(
    "All basic checks passed",
  );
  await page.getByText("Help me with this step", { exact: true }).click();
  await expect(
    page
      .locator(".feedback-help")
      .getByRole("heading", { name: "Rehearsal prompt", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".feedback-help-prompt")).toContainText(
    "without reading",
  );
  await expect(page.locator(".feedback-help-prompt")).not.toContainText(
    /target role|resume|configure/,
  );
  await expect(page.locator(".review")).not.toBeVisible();
  const records = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(records).toHaveLength(1);
  expect(records[0].data.review.score).toBe(100);
  expect(records[0].data.answer).toBe(answer);
});
