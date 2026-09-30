import {
  test,
  expect,
  answer,
  resetWorkspace,
  openWorkspace,
  tab,
} from "./fixtures";
import type { Page } from "@playwright/test";

const recap = (page: Page) =>
  page.getByRole("region", { name: "Mock interview recap" });
async function startMock(page: Page) {
  await openWorkspace(page);
  await page
    .getByRole("button", { name: "Start mock interview", exact: true })
    .click();
}
async function saveAnswer(page: Page) {
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update review", exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("recap separates a skipped round, failed save, unanswered current round and untouched questions", async ({
  page,
}) => {
  await startMock(page);
  await page
    .getByRole("button", { name: "Skip question", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { error: "Synthetic failed save" } })
      : route.fallback(),
  );
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Synthetic failed save");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End mock interview", exact: true })
    .click();
  await expect(recap(page)).toContainText("ENDED EARLY");
  await expect(recap(page)).toContainText("0 of 5 answers saved");
  await expect(recap(page).locator(".mock-round-status")).toHaveText([
    "Skipped",
    "Not saved",
    "Not answered",
    "Not reached",
    "Not reached",
  ]);
  await expect(
    recap(page).getByRole("button", { name: /View saved answer/ }),
  ).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});

test("saved versions remain accessible after unsaved edits, and deletion updates the recap", async ({
  page,
}) => {
  await startMock(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await saveAnswer(page);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(`${answer} Unsaved later changes.`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(page.locator(".mock-progress")).toContainText("Question 1 of 5");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End mock interview", exact: true })
    .click();
  await expect(recap(page)).toContainText("1 of 5 answers saved");
  await expect(recap(page).locator("li").first()).toContainText(
    "Later changes were not saved",
  );
  await recap(page)
    .getByRole("button", { name: "View saved answer 1", exact: true })
    .click();
  await expect(page.locator("#saved-answer-detail .saved-answer")).toHaveText(
    answer,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(recap(page)).toContainText("0 of 5 answers saved");
  await expect(recap(page).locator(".mock-round-status").first()).toHaveText(
    "Saved answer unavailable",
  );
  await expect(
    recap(page).getByRole("button", { name: /View saved answer/ }),
  ).toHaveCount(0);
});

test("switching an active technical mock to Quick retains its draft and later save updates the recap", async ({
  page,
}) => {
  await openWorkspace(page);
  await tab(page, "Technical lab");
  await page
    .getByRole("button", { name: "Start mock interview", exact: true })
    .click();
  const question = await page.locator(".practice h2").innerText();
  await page.getByLabel("Your solution & explanation").fill(answer);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await page
    .getByRole("button", { name: "Saved answers", exact: true })
    .click();
  await expect(recap(page).locator(".mock-round-status")).toHaveText([
    "Not saved",
    "Not reached",
    "Not reached",
    "Not reached",
    "Not reached",
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await recap(page)
    .getByRole("button", { name: "Continue current answer", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await expect(recap(page)).toContainText("1 of 5 answers saved");
  await recap(page)
    .getByRole("button", { name: "View saved answer 1", exact: true })
    .click();
  await expect(page.locator("#saved-answer-detail")).toBeFocused();
  await expect(page.locator("#saved-answer-detail .saved-answer")).toHaveText(
    answer,
  );
  await tab(page, "Progress");
  await expect(recap(page)).toContainText("1 of 5 answers saved");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});

test("category replacement and a cancelled new mock keep truthful recap and draft boundaries", async ({
  page,
}) => {
  await startMock(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await saveAnswer(page);
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("An unsaved second round.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Negotiation", exact: true }).click();
  await expect(page.locator(".mock-progress")).toContainText("Question 2 of 5");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Negotiation", exact: true }).click();
  await tab(page, "Progress");
  await expect(recap(page).locator(".mock-round-status")).toHaveText([
    "Saved",
    "Not saved",
    "Not reached",
    "Not reached",
    "Not reached",
  ]);
  await recap(page)
    .getByRole("button", { name: "Practice this next", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Start mock interview", exact: true })
    .click();
  await tab(page, "Progress");
  await expect(recap(page)).toContainText("1 of 5 answers saved");
  await recap(page)
    .getByRole("button", { name: "Return to practice", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Start mock interview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End mock interview", exact: true })
    .click();
  await expect(recap(page)).toContainText("0 of 5 answers saved");
  await expect(page.locator(".history-row")).toHaveCount(1);
});

test("cancelling final-round completion keeps the current draft and finishing offers a direct return", async ({
  page,
}) => {
  await startMock(page);
  for (let index = 0; index < 4; index++)
    await page
      .getByRole("button", { name: "Skip question", exact: true })
      .click();
  const question = await page.locator(".practice h2").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Finish mock interview", exact: true })
    .click();
  await expect(page.locator(".mock-progress")).toContainText("Question 5 of 5");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finish mock interview", exact: true })
    .click();
  await expect(recap(page)).toContainText("MOCK FINISHED");
  await expect(recap(page).locator(".mock-round-status")).toHaveText([
    "Skipped",
    "Skipped",
    "Skipped",
    "Skipped",
    "Not saved",
  ]);
  await recap(page)
    .getByRole("button", { name: "Continue current answer", exact: true })
    .click();
  await expect(page.locator(".practice h2")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
});

test("speech completes before advancing and late final words after End appear in the retained draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class SyntheticSpeechRecognition {
      onstart?: () => void;
      onend?: () => void;
      onresult?: (event: unknown) => void;
      stopping = false;
      start() {
        this.onstart?.();
      }
      stop() {
        if (this.stopping) return;
        this.stopping = true;
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [
              {
                isFinal: true,
                0: { transcript: "Completed synthetic transcript." },
              },
            ],
          });
          this.onend?.();
        }, 30);
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
  await startMock(page);
  await page
    .getByRole("button", { name: "Speak your answer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip question", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "Completed synthetic transcript.",
  );
  await expect(page.locator(".mock-progress")).toContainText("Question 1 of 5");
  await page
    .getByRole("button", { name: "Speak your answer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End mock interview", exact: true })
    .click();
  await expect(recap(page).locator(".mock-round-status").first()).toHaveText(
    "Not saved",
  );
  await recap(page)
    .getByRole("button", { name: "Continue current answer", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "Completed synthetic transcript. Completed synthetic transcript.",
  );
});
