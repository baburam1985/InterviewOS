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

test("the welcome stays put and changing goals preserves keyboard focus and the draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  const goalHeading = page.getByRole("heading", {
    name: "What would you like to practice?",
    exact: true,
  });
  await expect(goalHeading).not.toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Quick practice", exact: true }),
  ).toBeFocused();
  const start = page.getByRole("button", {
    name: "Start practicing",
    exact: true,
  });
  await start.focus();
  await page.keyboard.press("Enter");
  const input = page.getByLabel("Your answer", { exact: true });
  const question = await page.locator(".quick-question").innerText();
  await input.fill(answer);
  await page.getByRole("button", { name: "Change goal", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(goalHeading).toBeFocused();
  await expect(goalHeading).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: /Introduce myself/ }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: /Tell a work story/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /Tell a work story/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(start).toBeFocused();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(start).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Resume current answer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(answer);
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.locator(".quick-question")).toBeInViewport({ ratio: 1 });
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});

test("feedback comes into view after a scrolled keyboard submission and keeps focus through saving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByText("More options", { exact: true }).click();
  await page.getByText("Help me structure my answer", { exact: true }).click();
  let releaseSave!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") await waiting;
    await route.fallback();
  });
  try {
    const getFeedback = page.getByRole("button", {
      name: "Get feedback",
      exact: true,
    });
    await getFeedback.focus();
    await expect(getFeedback).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await page.keyboard.press("Enter");
    const feedbackHeading = page.getByRole("heading", {
      name: "Your next practice step.",
      exact: true,
    });
    await expect(feedbackHeading).toBeFocused();
    await expect(feedbackHeading).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saving your answer…",
    );
    releaseSave();
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saved to your history",
    );
    await expect(feedbackHeading).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Your answer", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      answer,
    );
    const records = (await (await page.request.get("/api/workspace")).json())
      .records;
    expect(records).toHaveLength(1);
    expect(records[0].data.answer).toBe(answer);
  } finally {
    releaseSave();
  }
});

test("choosing goals from feedback and returning from another workspace reveals the same review", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  const nextStep = await page.locator(".quick-next-step").innerText();
  const feedbackHeading = page.getByRole("heading", {
    name: "Your next practice step.",
    exact: true,
  });
  await page.getByText("Your question and answer", { exact: true }).click();
  await page.getByText("See detailed feedback", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Choose a different practice goal",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  const goalHeading = page.getByRole("heading", {
    name: "What would you like to practice?",
    exact: true,
  });
  await expect(goalHeading).toBeFocused();
  await expect(goalHeading).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "Resume current answer", exact: true })
    .click();
  await expect(feedbackHeading).toBeFocused();
  await expect(feedbackHeading).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".quick-next-step")).toHaveText(nextStep);
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(feedbackHeading).toBeFocused();
  await expect(feedbackHeading).toBeInViewport({ ratio: 1 });
  await advancedWorkspace(page);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(feedbackHeading).toBeFocused();
  await expect(feedbackHeading).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".quick-next-step")).toHaveText(nextStep);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
});

test("a completed save does not move the reader away from an opened answer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer.repeat(3));
  let releaseSave!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") await waiting;
    await route.fallback();
  });
  try {
    await page
      .getByRole("button", { name: "Get feedback", exact: true })
      .click();
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saving your answer…",
    );
    const details = page.getByText("Your question and answer", { exact: true });
    await details.click();
    await expect(details).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const position = await page.evaluate(() => window.scrollY);
    expect(position).toBeGreaterThan(100);
    releaseSave();
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saved to your history",
    );
    await expect(details).toBeFocused();
    // Saving removes its retry button; allow normal scroll anchoring as that
    // changes the page height, while ensuring the reader stays in their answer.
    await expect(
      page.locator(".quick-feedback .saved-answer"),
    ).toBeInViewport();
    await expect(
      page.getByRole("heading", {
        name: "Your next practice step.",
        exact: true,
      }),
    ).not.toBeInViewport();
    expect(
      (await (await page.request.get("/api/workspace")).json()).records,
    ).toHaveLength(1);
  } finally {
    releaseSave();
  }
});
