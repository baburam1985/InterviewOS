import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
  tab,
} from "./fixtures";
import { questions } from "../../lib/interview";

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("guests can try five distinct questions in each Quick goal without saving empty attempts", async ({
  page,
}) => {
  await page.context().clearCookies();
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts++;
  });
  await openQuickWorkspace(page);
  for (const [goal, category] of [
    ["Introduce myself", "Recruiter"],
    ["Tell a work story", "Behavioral"],
    ["Explain a solution", "Technical"],
    ["Discuss an offer", "Negotiation"],
  ]) {
    await page.getByRole("radio", { name: new RegExp(goal) }).check();
    await page
      .getByRole("button", { name: "Start practicing", exact: true })
      .click();
    const prompts = [];
    for (let index = 0; index < 5; index++) {
      const prompt = await page.locator(".quick-question").innerText();
      prompts.push(prompt);
      expect(
        questions.some((q) => q.text === prompt && q.category === category),
      ).toBeTruthy();
      await expect(page.getByLabel("Your answer", { exact: true })).toBeEmpty();
      await expect(
        page.getByRole("button", { name: "Get feedback", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Try another question", exact: true })
        .click();
    }
    expect(new Set(prompts).size).toBe(5);
    await expect(page.locator(".quick-question")).toHaveText(prompts[0]);
    await page
      .getByRole("button", { name: "Change goal", exact: true })
      .click();
  }
  expect(posts).toBe(0);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});

test("keyboard question changes protect drafts and reveal the next prompt on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const initial = await page.locator(".quick-question").innerText();
  const input = page.getByLabel("Your answer", { exact: true });
  const another = page.getByRole("button", {
    name: "Try another question",
    exact: true,
  });
  await input.fill("A draft I am still thinking about.");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Get feedback", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(another).toBeFocused();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("A draft I am still thinking about.");
  await expect(page.locator(".quick-question")).toHaveText(initial);
  await page.getByText("More options", { exact: true }).click();
  await page.getByText("Help me structure my answer", { exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await another.scrollIntoViewIfNeeded();
  await another.focus();
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Enter");
  await expect(page.locator(".quick-question")).not.toHaveText(initial);
  await expect(page.locator(".quick-question")).toBeInViewport({ ratio: 1 });
  await expect(input).toBeFocused();
  await expect(input).toBeEmpty();
  await expect(input).toHaveAccessibleDescription(
    await page.locator(".quick-question").innerText(),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});

test("choosing another question from a retry clears its focus while keeping the saved attempt", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const firstQuestion = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const before = (await (await page.request.get("/api/workspace")).json())
    .records[0].data;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".quick-focus")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Try another question", exact: true })
    .click();
  await expect(page.locator(".quick-question")).not.toHaveText(firstQuestion);
  await expect(page.locator(".quick-focus")).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEmpty();
  const unchanged = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(unchanged).toHaveLength(1);
  expect(unchanged[0].data).toEqual(before);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(`${answer} A new question's separate answer.`);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const records = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(records).toHaveLength(2);
  expect(
    new Set(records.map((record: { data: { id: string } }) => record.data.id))
      .size,
  ).toBe(2);
  expect(
    records.find(
      (record: { data: { id: string } }) => record.data.id === before.id,
    ).data,
  ).toEqual(before);
});

test("question choice waits for microphone completion and protects its final transcript", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class SyntheticSpeechRecognition {
      onstart?: () => void;
      onend?: () => void;
      onresult?: (event: unknown) => void;
      start() {
        this.onstart?.();
      }
      stop() {
        Object.defineProperty(window, "__finishSpeech", {
          configurable: true,
          value: () => {
            this.onresult?.({
              resultIndex: 0,
              results: [
                {
                  isFinal: true,
                  0: { transcript: "My final synthetic transcript." },
                },
              ],
            });
            this.onend?.();
          },
        });
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
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const initial = await page.locator(".quick-question").innerText();
  await page.getByText("More options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Speak your answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try another question", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Stop microphone", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try another question", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => Reflect.get(window, "__finishSpeech")());
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "My final synthetic transcript.",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Try another question", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(initial);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "My final synthetic transcript.",
  );
});

test("a custom technical question can return to the category bank without changing its route", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await tab(page, "Technical lab");
  await page
    .getByText("Use your own interview question", { exact: true })
    .click();
  const custom = "How would you test this synthetic interview workspace?";
  await page.getByLabel("Question", { exact: true }).fill(custom);
  await page.getByRole("button", { name: "Use question", exact: true }).click();
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.locator(".quick-question")).toHaveText(custom);
  await page
    .getByRole("button", { name: "Try another question", exact: true })
    .click();
  const selected = await page.locator(".quick-question").innerText();
  expect(
    questions.some((q) => q.text === selected && q.category === "Technical"),
  ).toBeTruthy();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeFocused();
  await advancedWorkspace(page);
  await expect(page.getByLabel("Your solution & explanation")).toBeVisible();
  await expect(page.locator(".practice h2")).toHaveText(selected);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});
