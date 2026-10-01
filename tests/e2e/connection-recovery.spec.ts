import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
} from "./fixtures";

const workspacePattern = "**/api/workspace";
const records = async (page: Page) => {
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBeTruthy();
  return (await response.json()).records;
};

// Let the real synthetic database respond, then hold only the browser reply.
// The app's unmodified native 15-second timeout must release its own busy state.
async function stallFirstReply(
  page: Page,
  baseURL: string | undefined,
  method: "GET" | "POST",
) {
  if (!baseURL) throw new Error("A local test origin is required.");
  const origin = new URL(baseURL).origin;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pending: Promise<void> | undefined;
  const state = { intercepted: false, committed: false };
  const handler = (route: Route) => {
    if (new URL(route.request().url()).origin !== origin)
      return route.abort("blockedbyclient");
    if (route.request().method() !== method || state.intercepted)
      return route.fallback();
    state.intercepted = true;
    pending = (async () => {
      const response = await route.fetch({ timeout: 10_000 });
      expect(response.ok()).toBeTruthy();
      state.committed = true;
      await gate;
      // An already-timed-out browser request may no longer accept a route action.
      await route.abort("aborted").catch(() => {});
    })();
    return pending;
  };
  await page.route(workspacePattern, handler);
  return {
    state,
    async finish() {
      release();
      await page.unroute(workspacePattern, handler);
      await pending;
    },
  };
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("a real browser offline save keeps the answer and retries the same record after reconnection", async ({
  page,
  context,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  const ids: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/workspace" &&
      request.method() === "POST"
    )
      ids.push(request.postDataJSON().data.id);
  });
  try {
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "Get feedback", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Could not connect");
    await expect(page.locator(".quick-saved")).toContainText(
      "Save not confirmed",
    );
    await expect(
      page.getByRole("button", { name: "Retry saving answer", exact: true }),
    ).toBeEnabled();
    await page.getByText("Your question and answer", { exact: true }).click();
    await expect(page.locator(".quick-feedback .saved-answer")).toHaveText(
      answer,
    );
  } finally {
    await context.setOffline(false);
  }
  expect(ids).toHaveLength(1);
  expect(await records(page)).toEqual([]);
  await advancedWorkspace(page);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  // Reconnection and navigation do not silently retry or save the answer.
  expect(ids).toHaveLength(1);
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(ids).toEqual([ids[0], ids[0]]);
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].data).toMatchObject({ id: ids[0], answer });
  await page.reload();
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator(".saved-answer")).toHaveText(answer);
});

test("the real client timeout releases a stalled committed save without duplicating it on retry", async ({
  page,
  baseURL,
}) => {
  await openQuickWorkspace(page);
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const question = await page.locator(".quick-question").innerText();
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  const stall = await stallFirstReply(page, baseURL, "POST");
  const ids: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/workspace" &&
      request.method() === "POST"
    )
      ids.push(request.postDataJSON().data.id);
  });
  const started = Date.now();
  try {
    await page
      .getByRole("button", { name: "Get feedback", exact: true })
      .click();
    await expect.poll(() => stall.state.committed).toBe(true);
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saving your answer…",
    );
    await expect(
      page.getByRole("button", { name: "Advanced workspace", exact: true }),
    ).toBeDisabled();
    const committed = await records(page);
    expect(committed).toHaveLength(1);
    expect(committed[0].data).toMatchObject({ id: ids[0], answer });
    await expect(page.getByRole("status")).toContainText(
      "The request timed out",
      { timeout: 25_000 },
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(14_000);
    await expect(page.locator(".quick-saved")).toContainText(
      "Save not confirmed",
    );
    await expect(
      page.getByRole("button", { name: "Retry saving answer", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Advanced workspace", exact: true }),
    ).toBeEnabled();
  } finally {
    await stall.finish();
  }
  await advancedWorkspace(page);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    answer,
  );
  await expect(page.locator(".practice h2")).toHaveText(question);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  expect(ids).toHaveLength(1);
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  expect(ids).toEqual([ids[0], ids[0]]);
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].data).toMatchObject({ id: ids[0], question, answer });
  await page.reload();
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  await expect(page.locator(".saved-answer")).toHaveText(answer);
});

test("a stalled initial load times out into safe practice and a retry keeps draft and saved history", async ({
  page,
  baseURL,
}) => {
  const original = {
    id: randomUUID(),
    question: "Tell me about a project.",
    answer,
    category: "Behavioral",
    seconds: 0,
    createdAt: new Date().toISOString(),
  };
  expect(
    (
      await page.request.post("/api/workspace", {
        data: { kind: "session", data: original },
      })
    ).ok(),
  ).toBeTruthy();
  const before = await records(page);
  const stall = await stallFirstReply(page, baseURL, "GET");
  let writes = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/workspace" &&
      request.method() === "POST"
    )
      writes += 1;
  });
  try {
    await page.goto("/");
    await expect.poll(() => stall.state.committed).toBe(true);
    await expect(
      page.getByText("Loading your saved workspace…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start practicing", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "The request timed out" }),
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      page.getByText("Loading your saved workspace…", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText(
      "Your saved workspace is unavailable",
    );
  } finally {
    await stall.finish();
  }
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  const draft = "My current draft stays here while I reconnect to saved work.";
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.locator(".quick-saved")).toContainText("Not saved yet");
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Retry loading workspace", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByText("Your question and answer", { exact: true }).click();
  await expect(page.locator(".quick-feedback .saved-answer")).toHaveText(draft);
  expect(writes).toBe(0);
  expect(await records(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Retry saving answer", exact: true })
    .click();
  await expect(page.locator(".quick-saved")).toHaveText(
    "Saved to your history",
  );
  const saved = await records(page);
  expect(saved).toHaveLength(2);
  expect(
    saved.find(
      (record: { data: { id: string } }) => record.data.id === original.id,
    ),
  ).toEqual(before[0]);
  expect(
    saved.find(
      (record: { data: { id: string } }) => record.data.id !== original.id,
    ).data.answer,
  ).toBe(draft);
  expect(writes).toBe(1);
});
