import {
  test as base,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

export const answer =
  "During a project our team faced unclear requirements. I owned the release testing strategy and needed to improve quality. First I analyzed the highest risk flows because we had limited time. Then I implemented a focused test plan, reviewed it with the team, and prioritized the most important scenarios. As a result, we reduced escaped defects by 35 percent over six weeks. I learned to align stakeholders early.";

export const test = base.extend<{ browserSafety: void }>({
  browserSafety: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Only our cloud/local test browser and its disposable local server are used.
      // Fail closed on external browser traffic; never call a paid AI service.
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== baseURL) return route.abort("blockedbyclient");
        if (url.pathname === "/api/coach") {
          if (route.request().method() !== "GET")
            throw new Error("Live AI requests are forbidden in this suite.");
          return route.fulfill({ json: { available: false } });
        }
        return route.continue();
      });
      await use();
      expect(errors, "No uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// The runner starts its own server and resets only .wrangler/test-state.
// The default database and all remote accounts are untouched.
export async function resetWorkspace(page: Page) {
  await resetWorkspaceRequest(page.request);
}

export async function resetWorkspaceRequest(request: APIRequestContext) {
  const login = await request.get("/signin-with-chatgpt?return_to=/");
  expect(login.ok()).toBeTruthy();
  const response = await request.get("/api/workspace");
  expect(response.status(), await response.text()).toBe(200);
  const { records } = await response.json();
  for (const record of records) {
    const id = record.kind === "profile" ? "profile" : record.data.id;
    const removed = await request.delete(
      `/api/workspace?id=${encodeURIComponent(id)}`,
    );
    expect(removed.ok()).toBeTruthy();
  }
}

export async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next great answer." }),
  ).toBeVisible();
  await expect(
    page.getByText("Loading your saved workspace…", { exact: true }),
  ).toHaveCount(0);
}

export async function tab(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}
