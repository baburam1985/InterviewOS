import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
} from "./fixtures";
import { PRACTICE_HANDOFF_KEY } from "../../lib/practice-handoff";

const recovery = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Resume practice after sign-in" });

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
  await page.context().clearCookies();
});

test("guest feedback survives sign-in and saves only after explicit resume and save", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  const suggestion = await page.locator(".quick-next-step").innerText();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(recovery(page)).toHaveCount(0);
  await expect(page.locator(".quick-next-step")).toHaveText(suggestion);
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await page.getByText("Your question and answer", { exact: true }).click();
  await expect(page.locator(".saved-answer")).toHaveText(answer);
  await expect(
    page.getByRole("heading", { name: question, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PRACTICE_HANDOFF_KEY,
    ),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Saved answers (1)", exact: true }),
  ).toBeVisible();
  await expect(recovery(page)).toHaveCount(0);
  const { records } = await (await page.request.get("/api/workspace")).json();
  expect(records).toHaveLength(1);
  expect(records[0].data.answer).toBe(answer);
  expect(records[0].data.question).toBe(question);
});

test("cancelled sign-in can resume as guest, and the next sign-in keeps the latest draft", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  // Model returning from a cancelled authentication flow without a session cookie.
  const signIn = "**/signin-with-chatgpt?return_to=/";
  await page.route(signIn, (route) =>
    route.fulfill({ status: 302, headers: { location: "/" } }),
  );
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  const updated = `${answer} This is my newer draft after returning.`;
  await page.getByLabel("Your answer", { exact: true }).fill(updated);
  await page.unroute(signIn);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    updated,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});

test("a pending recovery cannot overwrite newer work without confirmation, and discard keeps current work", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("A different answer that must be kept.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "A different answer that must be kept.",
  );
  await expect(recovery(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await expect(recovery(page)).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "A different answer that must be kept.",
  );
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PRACTICE_HANDOFF_KEY,
    ),
  ).toBeNull();
});

test("blocked storage stops sign-in and offers a complete export or explicit continuation", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage disabled", "SecurityError");
      original.call(this, name, value);
    };
  }, PRACTICE_HANDOFF_KEY);
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "couldn’t keep a temporary copy",
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download draft", exact: true })
    .click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe(
    `${question}\n\n${answer}`,
  );
  await page
    .getByRole("link", { name: "Continue without draft", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start practicing", exact: true }),
  ).toBeVisible();
  await expect(recovery(page)).toHaveCount(0);
});

test("technical recovery works during a workspace load failure without saving or resuming a mock", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page.getByRole("radio", { name: /Explain a solution/ }).check();
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await advancedWorkspace(page);
  await page
    .getByRole("button", { name: "Start mock interview", exact: true })
    .click();
  const question = await page.locator(".practice h2").innerText();
  await page.getByLabel("Your solution & explanation").fill(answer);
  await page.route("**/api/workspace", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        status: 503,
        json: { error: "Temporary test failure" },
      });
    return route.fallback();
  });
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Advanced workspace", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Your solution & explanation")).toHaveValue(
    answer,
  );
  await expect(page.locator(".practice h2")).toHaveText(question);
  await expect(
    page.getByRole("button", { name: "Start mock interview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & save", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/workspace");
  await page
    .getByRole("button", { name: "Retry loading workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review & save", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Your solution & explanation")).toHaveValue(
    answer,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});

test("sign-in stops active speech and lets the user check the final transcript before leaving", async ({
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
        this.onresult?.({
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: "Final synthetic words after stopping." },
            },
          ],
        });
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
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByText("More options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Speak your answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop microphone", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Check your transcript");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "Final synthetic words after stopping.",
  );
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PRACTICE_HANDOFF_KEY,
    ),
  ).toBeNull();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "Final synthetic words after stopping.",
  );
});

test("cancelling the unsaved-profile warning leaves current work intact and a later sign-in replaces the snapshot", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await advancedWorkspace(page);
  await page
    .getByRole("button", { name: "Role & resume", exact: true })
    .click();
  await page.getByLabel("Role", { exact: true }).fill("Unsaved synthetic role");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "Unsaved synthetic role",
  );
  await page
    .getByRole("button", { name: "Practice room", exact: true })
    .click();
  const latest = `${answer} Updated after cancelling navigation.`;
  await page.getByLabel("Your answer", { exact: true }).fill(latest);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(recovery(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Resume answer", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    latest,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
});

test("opening sign-in in another tab does not bypass this tab's unsaved-work warning", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  const stillProtected = await page
    .getByRole("link", { name: "Sign in", exact: true })
    .evaluate((link) => {
      // Let the React handler receive the modified click, then cancel its browser
      // default at the window boundary so this test need not open an auth tab.
      window.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      });
      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
        }),
      );
      const warning = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(warning);
      return warning.defaultPrevented;
    });
  expect(stillProtected).toBeTruthy();
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PRACTICE_HANDOFF_KEY,
    ),
  ).toBeNull();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
});

test("embedded sign-in offers export before leaving its storage context", async ({
  page,
}) => {
  await page.route("**/test-embed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Synthetic embed</title><iframe title="Interview practice" src="/" style="width:100%;height:900px"></iframe>',
    }),
  );
  await page.goto("/test-embed");
  const app = page.frameLocator('iframe[title="Interview practice"]');
  await app
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await app.locator(".quick-question").innerText();
  await app.getByLabel("Your answer", { exact: true }).fill(answer);
  await app.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText(
    "draft may not carry over",
  );
  await expect(app.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  const downloadPromise = page.waitForEvent("download");
  await app
    .getByRole("button", { name: "Download draft", exact: true })
    .click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe(
    `${question}\n\n${answer}`,
  );
  await app
    .getByRole("link", { name: "Continue without draft", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start practicing", exact: true }),
  ).toBeVisible();
  await expect(recovery(page)).toHaveCount(0);
});
