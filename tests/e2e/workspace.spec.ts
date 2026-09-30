import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openWorkspace,
  advancedWorkspace,
  tab,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("profile and STAR stories persist, edit, cancel deletion, and delete", async ({
  page,
}) => {
  await openWorkspace(page);
  await tab(page, "Role & resume");
  await page.getByLabel("Role", { exact: true }).fill("QA Engineer");
  await page
    .getByLabel("Company", { exact: true })
    .fill("Synthetic Example Company");
  await page
    .getByLabel("Job description")
    .fill("Build reliable systems and lead test strategy.");
  await page
    .getByLabel("Resume or experience notes")
    .fill("I led release testing and reduced defects by 35%.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Role and resume saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
  await tab(page, "Role & resume");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "QA Engineer",
  );
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
    "Synthetic Example Company",
  );
  await page.getByRole("button", { name: "Practice for this role" }).click();
  await expect(
    page.getByText(
      "What makes you a strong fit for QA Engineer at Synthetic Example Company?",
      { exact: true },
    ),
  ).toBeVisible();
  await tab(page, "Story library");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save story", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Story title")
    .fill("Synthetic story: launch through ambiguity");
  await page
    .getByLabel("S · Situation")
    .fill("During a project the launch requirements were unclear.");
  await page.getByLabel("T · Task").fill("I owned testing strategy.");
  await page
    .getByLabel("A · Action")
    .fill("First I analyzed risk, then implemented focused tests.");
  await page.getByLabel("R · Result").fill("We reduced defects by 30%.");
  await page.getByRole("button", { name: "Save story", exact: true }).click();
  const story = page
    .getByRole("article")
    .filter({ hasText: "Synthetic story: launch through ambiguity" });
  await expect(story).toBeVisible();
  await story.getByRole("button", { name: "Edit story", exact: true }).click();
  await page.getByLabel("R · Result").fill("We reduced defects by 35%.");
  await page.getByRole("button", { name: "Save story", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
  await tab(page, "Story library");
  await expect(story).toContainText("We reduced defects by 35%.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await story
    .getByRole("button", {
      name: "Delete Synthetic story: launch through ambiguity",
    })
    .click();
  await expect(story).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await story
    .getByRole("button", {
      name: "Delete Synthetic story: launch through ambiguity",
    })
    .click();
  await expect(story).toHaveCount(0);
  await expect(page.getByText("Your best examples belong here.")).toBeVisible();
});

test("answers save, update in place, reload, export, and delete", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
  await expect(page.locator(".review")).toContainText("100% checks met");
  await tab(page, "Progress");
  await page.locator(".history-row").click();
  await expect(page.locator(".saved-answer")).toHaveText(answer);
  await tab(page, "Practice room");
  const revised = `${answer} We documented the outcome for the next release.`;
  await page.getByLabel("Your answer", { exact: true }).fill(revised);
  await page
    .getByRole("button", { name: /^(Review & save|Update review)/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
  await tab(page, "Progress");
  // A previously selected detail panel must refresh without selecting it again.
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.locator(".saved-answer")).toHaveText(revised);
  await page.reload();
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
  await tab(page, "Progress");
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.locator(".history-row").click();
  await expect(page.locator(".saved-answer")).toHaveText(revised);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export review", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^interview-review-.*\.md$/);
  expect(await readFile((await download.path())!, "utf8")).toContain(revised);
  const workspacePromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  const workspace = JSON.parse(
    await readFile((await (await workspacePromise).path())!, "utf8"),
  );
  expect(workspace.sessions).toHaveLength(1);
  expect(workspace.sessions[0].answer).toBe(revised);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(page.locator(".history-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export workspace", exact: true }),
  ).toBeDisabled();
});

test("question search, filtering, custom prompts, and unsaved-answer cancellation", async ({
  page,
}) => {
  await openWorkspace(page);
  await tab(page, "Question bank");
  await page.getByLabel("Search questions").fill("ambiguity");
  await expect(page.locator(".question-list > button")).toHaveCount(1);
  await page.getByLabel("Search questions").fill("no-such-synthetic-question");
  await expect(
    page.getByText("No matching questions.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search questions").fill("");
  await page.getByLabel("Filter by interview type").selectOption("Technical");
  await expect(page.locator(".question-list > button")).toHaveCount(5);
  await page.locator(".question-list > button").first().click();
  await expect(
    page.getByRole("heading", { name: "Show your thinking." }),
  ).toBeVisible();
  await page
    .getByLabel("Your solution & explanation")
    .fill("A draft worth preserving");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(page.getByLabel("Your solution & explanation")).toHaveValue(
    "A draft worth preserving",
  );
  await page
    .getByText("Use your own interview question", { exact: true })
    .click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("How would you test an interview practice application?");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Use question", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How would you test an interview practice application?",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Your solution & explanation")).toBeEmpty();
});

test("technical answers use the technical rubric and saved history", async ({
  page,
}) => {
  await openWorkspace(page);
  await tab(page, "Technical lab");
  await page
    .getByLabel("Your solution & explanation")
    .fill(
      "Clarify the input requirements and output indices first. My approach uses a hash map to record each number and its index. Check each input for its complement before inserting it so the same position is not reused. Time complexity is O(n) and space complexity is O(n). Test empty input, no solution, negative values, and duplicate numbers. Compare against a simple quadratic baseline on 100 generated examples.",
    );
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
  await expect(page.locator(".review")).toContainText("100% checks met");
  await expect(page.locator(".review")).toContainText("Covers edge cases");
  await tab(page, "Progress");
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.locator(".history-row")).toContainText("Technical");
});

test("a mock in a short category completes five unique saved rounds", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Negotiation", exact: true }).click();
  await page
    .getByRole("button", { name: "Start mock interview", exact: true })
    .click();
  const prompts: string[] = [];
  for (let round = 1; round <= 5; round++) {
    await expect(page.locator(".mock-progress")).toContainText(
      `Question ${round} of 5`,
    );
    prompts.push((await page.locator(".practice h2").textContent())!);
    await page
      .getByLabel("Your answer", { exact: true })
      .fill(`${answer} This is synthetic round ${round}.`);
    await page.getByRole("button", { name: "Review & save" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Answer and review saved" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: round === 5 ? "Finish mock interview" : "Next question",
        exact: true,
      })
      .click();
  }
  expect(new Set(prompts).size).toBe(5);
  await expect(
    page.getByRole("heading", { name: "See how far you’ve come." }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Mock interview complete" }),
  ).toBeVisible();
  await expect(page.locator(".history-row")).toHaveCount(5);
});

test("a failed save preserves the draft and retry saves exactly once", async ({
  page,
}) => {
  await openWorkspace(page);
  let attempts = 0;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST" && attempts++ === 0) {
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic temporary save failure. Please retry." },
      });
    }
    await route.fallback();
  });
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic temporary save failure",
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
  await tab(page, "Progress");
  await expect(page.locator(".history-row")).toHaveCount(1);
});

test("workspace load failure offers a safe retry", async ({ page }) => {
  let failed = false;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "GET" && !failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        json: { error: "Your workspace could not be loaded. Please retry." },
      });
    }
    await route.fallback();
  });
  await openWorkspace(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await expect(
    page.getByRole("button", { name: "Review & save" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(
    page.getByRole("button", { name: "Review & save" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
});

test("starting a new story cannot silently discard a draft", async ({
  page,
}) => {
  await openWorkspace(page);
  await tab(page, "Story library");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await page.getByLabel("Story title").fill("Unsaved synthetic story");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await expect(page.getByLabel("Story title")).toHaveValue(
    "Unsaved synthetic story",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Story title")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Story title")).toHaveCount(0);
});

test("all workspace sections fit phone, tablet, and desktop screens", async ({
  page,
}, testInfo) => {
  await openWorkspace(page);
  const sections = [
    "Practice room",
    "Story library",
    "Role & resume",
    "Question bank",
    "Technical lab",
    "Progress",
    "Research & settings",
  ];
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of sections) {
      await tab(page, section);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${section} at ${width}px must not overflow`,
      ).toBeTruthy();
    }
    await tab(page, "Practice room");
    await page.screenshot({
      path: testInfo.outputPath(`workspace-${width}.png`),
      fullPage: true,
    });
  }
  await tab(page, "Research & settings");
  await expect(page.locator(".capability")).toHaveCount(10);
  await expect(page.getByLabel("Enable optional AI coaching")).toBeDisabled();
});

test("unsupported microphone has a clear typed-answer fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });
  });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Speak your answer" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Voice transcription is unavailable",
  );
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await expect(
    page.getByRole("button", { name: "Review & save" }),
  ).toBeEnabled();
});

test("microphone denial is recoverable without requesting a real device", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class DeniedSpeechRecognition {
      onerror?: (event: { error: string }) => void;
      onend?: () => void;
      start() {
        queueMicrotask(() => {
          this.onerror?.({ error: "not-allowed" });
          this.onend?.();
        });
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: DeniedSpeechRecognition,
      configurable: true,
    });
  });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Speak your answer" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Microphone permission was denied",
  );
  await expect(
    page.getByRole("button", { name: "Speak your answer" }),
  ).toBeEnabled();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
});

test("local sign-in restores private workspace access", async ({ page }) => {
  await page.context().clearCookies();
  await openWorkspace(page);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
  await advancedWorkspace(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await expect(
    page.getByRole("button", { name: "Review & save" }),
  ).toBeEnabled();
});

test("saving locks editing and navigation until the request finishes", async ({
  page,
}) => {
  await openWorkspace(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") await waiting;
    await route.fallback();
  });
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Review & save" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Technical lab", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("status").filter({ hasText: "Answer and review saved" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("late transcription after switching questions cannot alter the next answer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class SyntheticSpeechRecognition {
      onstart?: () => void;
      onend?: () => void;
      constructor() {
        Object.defineProperty(window, "__testRecognition", {
          value: this,
          configurable: true,
        });
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: SyntheticSpeechRecognition,
      configurable: true,
    });
  });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Speak your answer" }).click();
  await expect(
    page.getByRole("button", { name: "Stop microphone" }),
  ).toBeVisible();
  await tab(page, "Technical lab");
  await page.evaluate(() => {
    const recognition = Reflect.get(window, "__testRecognition");
    recognition.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          0: { transcript: "Stale text must not enter the new answer" },
        },
      ],
    });
  });
  await expect(page.getByLabel("Your solution & explanation")).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Speak your answer" }),
  ).toBeVisible();
});

test("resume import locks saving until the complete text is ready", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const readText = File.prototype.text;
    File.prototype.text = function () {
      const read = readText.bind(this);
      return new Promise<string>((resolve, reject) => {
        Object.defineProperty(window, "__finishResumeRead", {
          configurable: true,
          value: () => read().then(resolve, reject),
        });
      });
    };
  });
  await openWorkspace(page);
  await tab(page, "Role & resume");
  const resume =
    "Synthetic imported resume: I led testing for 3 releases and reduced defects by 35%.";
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(resume),
  });
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Resume or experience notes")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Practice room", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => Reflect.get(window, "__finishResumeRead")());
  await expect(page.getByLabel("Resume or experience notes")).toHaveValue(
    resume,
  );
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Role and resume saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
  await tab(page, "Role & resume");
  await expect(page.getByLabel("Resume or experience notes")).toHaveValue(
    resume,
  );
});
