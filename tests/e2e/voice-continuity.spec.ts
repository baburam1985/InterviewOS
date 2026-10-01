import type { Page } from "@playwright/test";
import {
  test,
  expect,
  resetWorkspace,
  openQuickWorkspace,
  openWorkspace,
} from "./fixtures";

const finalWords =
  "My final synthetic spoken answer, kept until I decide what to do.";

async function delayedVoice(page: Page) {
  await page.addInitScript((transcript) => {
    const stats = { stops: 0, aborts: 0 };
    Reflect.set(window, "__voiceStats", stats);
    class SyntheticSpeechRecognition {
      onstart?: () => void;
      onend?: () => void;
      onresult?: (event: unknown) => void;
      start() {
        this.onstart?.();
        this.onresult?.({
          resultIndex: 0,
          results: [
            { isFinal: false, 0: { transcript: "Finishing my example…" } },
          ],
        });
      }
      stop() {
        stats.stops += 1;
        Reflect.set(window, "__finishVoice", () => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript } }],
          });
          this.onend?.();
        });
      }
      abort() {
        stats.aborts += 1;
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: SyntheticSpeechRecognition,
    });
  }, finalWords);
}

async function finishVoice(page: Page) {
  expect(
    await page.evaluate(() => Reflect.get(window, "__voiceStats").stops),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "__voiceStats").aborts),
  ).toBe(0);
  await page.evaluate(() => Reflect.get(window, "__finishVoice")());
}

async function cancelReplacement(page: Page, action: () => Promise<unknown>) {
  const confirmation = page.waitForEvent("dialog");
  const pending = action();
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toBe("Replace this unsaved answer?");
  await dialog.dismiss();
  await pending;
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
  await delayedVoice(page);
});

test("changing a Quick goal waits for the final voice answer and keeps replacement under the user's control", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByText("More options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Speak your answer", exact: true })
    .click();
  await expect(
    page.getByText("Finishing my example…", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change goal", exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Finishing voice input. Check your transcript before continuing.",
    }),
  ).toBeVisible();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(
    page.getByRole("button", { name: "Start practicing", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeDisabled();
  await finishVoice(page);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    finalWords,
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
  await expect(page.getByRole("status")).toContainText(
    "Voice input finished. Check your answer before continuing.",
  );
  await expect(page.locator(".quick-question")).toHaveText(question);

  await page.getByRole("button", { name: "Change goal", exact: true }).click();
  await page.getByRole("radio", { name: /Tell a work story/ }).check();
  await cancelReplacement(page, () =>
    page.getByRole("button", { name: "Start practicing", exact: true }).click(),
  );
  await page
    .getByRole("button", { name: "Resume current answer", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    finalWords,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual([]);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const { records } = await (await page.request.get("/api/workspace")).json();
  expect(records).toHaveLength(1);
  expect(records[0].data).toMatchObject({ question, answer: finalWords });
});

test("switching an empty Advanced voice answer to Quick cannot start over before transcription ends", async ({
  page,
}) => {
  await openWorkspace(page);
  const question = await page.locator(".practice h2").innerText();
  await page
    .getByRole("button", { name: "Speak your answer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  const start = page.getByRole("button", {
    name: "Start practicing",
    exact: true,
  });
  await expect(start).toBeDisabled();
  await expect(
    page.getByRole("status").filter({
      hasText: "Your current answer will be available when transcription ends.",
    }),
  ).toBeVisible();
  await finishVoice(page);
  await expect(start).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Resume current answer", exact: true }),
  ).toBeVisible();
  // Completion alone must not replace the question, open a new attempt or save.
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual([]);
  await cancelReplacement(page, () => start.click());
  await page
    .getByRole("button", { name: "Resume current answer", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    finalWords,
  );
});

for (const replacement of [
  "Leadership",
  "Technical lab",
  "Start mock interview",
]) {
  test(`Advanced ${replacement} keeps the finishing transcript until a confirmed replacement`, async ({
    page,
  }) => {
    await openWorkspace(page);
    const question = await page.locator(".practice h2").innerText();
    await page
      .getByRole("button", { name: "Speak your answer", exact: true })
      .click();
    const replace = page.getByRole("button", {
      name: replacement,
      exact: true,
    });
    await replace.click();
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Finishing voice input. Check your transcript before continuing.",
      }),
    ).toBeVisible();
    await expect(page.locator(".practice h2")).toHaveText(question);
    await expect(
      page.getByRole("button", { name: "Start mock interview", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Your answer", { exact: true }),
    ).toBeDisabled();
    await finishVoice(page);
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      finalWords,
    );
    await cancelReplacement(page, () => replace.click());
    await expect(page.locator(".practice h2")).toHaveText(question);
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      finalWords,
    );
    expect(
      (await (await page.request.get("/api/workspace")).json()).records,
    ).toEqual([]);
    const confirmation = page.waitForEvent("dialog");
    const replacing = replace.click();
    const dialog = await confirmation;
    expect(dialog.message()).toBe("Replace this unsaved answer?");
    await dialog.accept();
    await replacing;
    await expect(
      page.getByLabel(
        replacement === "Technical lab"
          ? "Your solution & explanation"
          : "Your answer",
        { exact: true },
      ),
    ).toBeEmpty();
    if (replacement === "Start mock interview") {
      await expect(page.locator(".mock-progress")).toContainText(
        "Question 1 of 5",
      );
    } else {
      await expect(page.locator(".practice h2")).not.toHaveText(question);
    }
    expect(
      (await (await page.request.get("/api/workspace")).json()).records,
    ).toEqual([]);
  });
}
