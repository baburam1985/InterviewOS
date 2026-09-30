import type { Page } from "@playwright/test";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  openWorkspace,
  tab,
} from "./fixtures";
const setupStatus = (page: Page) =>
  page.getByRole("status", { name: "AI setup status" });
async function enableAI(page: Page) {
  await tab(page, "Research & settings");
  await page.getByLabel("Enable optional AI coaching", { exact: true }).check();
  await tab(page, "Practice room");
}
function localOrigin(baseURL: string | undefined) {
  if (!baseURL) throw new Error("A local test origin is required.");
  return new URL(baseURL).origin;
}
async function stored(page: Page) {
  return (await (await page.request.get("/api/workspace")).json()).records;
}
test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

for (const failure of ["invalid", "unavailable"] as const) {
  test(`${failure} setup responses keep AI disabled and rechecks preserve the current Quick draft`, async ({
    page,
    baseURL,
  }) => {
    const origin = localOrigin(baseURL);
    let phase: "failed" | "absent" | "configured" = "failed";
    let posts = 0;
    await page.route("**/api/coach", async (route) => {
      if (new URL(route.request().url()).origin !== origin)
        return route.abort("blockedbyclient");
      if (route.request().method() !== "GET") {
        posts++;
        return route.fulfill({ json: { text: "Unexpected request" } });
      }
      if (phase === "failed")
        return route.fulfill(
          failure === "invalid"
            ? { json: { available: "yes" } }
            : { status: 503, json: { error: "Synthetic service outage" } },
        );
      return route.fulfill({ json: { available: phase === "configured" } });
    });
    await openQuickWorkspace(page);
    await page
      .getByRole("button", { name: "Start practicing", exact: true })
      .click();
    const question = await page.locator(".quick-question").innerText();
    await page.getByLabel("Your answer", { exact: true }).fill(answer);
    await tab(page, "Research & settings");
    await expect(setupStatus(page)).toHaveText(
      "AI setup could not be checked. Built-in coaching still works. Try checking again.",
    );
    await expect(
      page.getByLabel("Enable optional AI coaching", { exact: true }),
    ).toBeDisabled();
    phase = "absent";
    await page
      .getByRole("button", { name: "Check AI setup", exact: true })
      .click();
    await expect(setupStatus(page)).toHaveText(
      "No AI key is configured. Built-in coaching still works.",
    );
    phase = "configured";
    const retry = page.getByRole("button", {
      name: "Check AI setup",
      exact: true,
    });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(setupStatus(page)).toHaveText(
      "An AI key is configured. Enable optional AI to request coaching.",
    );
    await expect(
      page.getByLabel("Enable optional AI coaching", { exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Enable optional AI coaching", { exact: true }),
    ).not.toBeChecked();
    await page.getByText("AI setup and current scope", { exact: true }).click();
    await expect(
      page.getByText(
        /does not verify provider access, billing or response quality/,
      ),
    ).toBeVisible();
    expect(posts).toBe(0);
    await page
      .getByRole("button", { name: "Quick practice", exact: true })
      .click();
    await expect(page.locator(".quick-question")).toHaveText(question);
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      answer,
    );
    await page
      .getByRole("button", { name: "Get feedback", exact: true })
      .click();
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saved to your history",
    );
    expect(await stored(page)).toHaveLength(1);
    expect(posts).toBe(0);
  });
}

test("malformed coaching keeps existing saved feedback and an explicit retry updates the same answer", async ({
  page,
  baseURL,
}) => {
  const origin = localOrigin(baseURL);
  let result: unknown = { text: "First synthetic coaching." };
  let posts = 0;
  await page.route("**/api/coach", async (route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    if (route.request().method() === "GET")
      return route.fulfill({ json: { available: true } });
    posts++;
    return route.fulfill({ json: result });
  });
  await openWorkspace(page);
  await enableAI(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page
    .getByRole("button", { name: "Get AI coaching", exact: true })
    .click();
  await expect(page.locator(".ai-feedback")).toContainText(
    "First synthetic coaching.",
  );
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update review", exact: true }),
  ).toBeEnabled();
  const before = await stored(page);
  expect(before).toHaveLength(1);
  result = { text: { message: "An invalid object must never render" } };
  await page
    .getByRole("button", { name: "Get AI coaching", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "AI returned an unexpected response",
  );
  await expect(page.locator(".ai-feedback")).toContainText(
    "First synthetic coaching.",
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await expect(
    page.getByRole("button", { name: "Update review", exact: true }),
  ).toBeEnabled();
  expect(await stored(page)).toEqual(before);
  const plain =
    "Second synthetic coaching.\n<script>window.syntheticAttack = true</script>";
  result = { text: plain };
  await page
    .getByRole("button", { name: "Get AI coaching", exact: true })
    .click();
  await expect(page.locator(".ai-feedback p")).toHaveText(plain);
  expect(await page.evaluate(() => "syntheticAttack" in window)).toBeFalsy();
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update review", exact: true }),
  ).toBeEnabled();
  const after = await stored(page);
  expect(after).toHaveLength(1);
  expect(after[0].data).toMatchObject({
    id: before[0].data.id,
    answer,
    ai: plain,
  });
  expect(posts).toBe(3);
});

test("oversized coaching leaves the draft usable and built-in feedback can still save it", async ({
  page,
  baseURL,
}) => {
  const origin = localOrigin(baseURL);
  await page.route("**/api/coach", async (route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    return route.fulfill({
      json:
        route.request().method() === "GET"
          ? { available: true }
          : { text: "x".repeat(20_001) },
    });
  });
  await openWorkspace(page);
  await enableAI(page);
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page
    .getByRole("button", { name: "Get AI coaching", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "AI returned an unexpected response",
  );
  await expect(page.locator(".ai-feedback")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const saved = await stored(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].data.answer).toBe(answer);
  expect(saved[0].data.ai).toBeUndefined();
});

test("a pending setup check stays disabled without blocking practice or sending provider requests", async ({
  page,
  baseURL,
}) => {
  const origin = localOrigin(baseURL);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/coach", async (route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    expect(route.request().method()).toBe("GET");
    requests++;
    await waiting;
    return route.fulfill({ json: { available: false } });
  });
  try {
    await openWorkspace(page);
    await tab(page, "Research & settings");
    await expect(setupStatus(page)).toHaveText(
      "Checking AI setup. Built-in coaching is ready to use.",
    );
    await expect(
      page.getByRole("button", { name: "Checking AI setup…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Enable optional AI coaching", { exact: true }),
    ).toBeDisabled();
    await tab(page, "Practice room");
    await page.getByLabel("Your answer", { exact: true }).fill(answer);
    await page
      .getByRole("button", { name: "Review & save", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Update review", exact: true }),
    ).toBeEnabled();
    release();
    await tab(page, "Research & settings");
    await expect(setupStatus(page)).toHaveText(
      "No AI key is configured. Built-in coaching still works.",
    );
    expect(requests).toBe(1);
  } finally {
    release();
  }
});
