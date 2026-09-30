import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  answer,
  resetWorkspace,
  openQuickWorkspace,
  advancedWorkspace,
  tab,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

for (const responseType of ["malformed", "mismatched"]) {
  test(`${responseType} save acknowledgements preserve feedback and retry the committed answer without duplication`, async ({
    page,
  }) => {
    await openQuickWorkspace(page);
    const ids: string[] = [];
    await page.route("**/api/workspace", async (route) => {
      if (route.request().method() === "POST") {
        ids.push(route.request().postDataJSON().data.id);
        if (ids.length === 1) {
          // Commit to the actual synthetic D1, then damage only the reply.
          const response = await route.fetch();
          expect(response.ok()).toBeTruthy();
          const saved = await response.json();
          return route.fulfill({
            response,
            json:
              responseType === "malformed"
                ? {}
                : {
                    data: {
                      ...saved.data,
                      answer: "A different valid-looking answer.",
                    },
                  },
          });
        }
      }
      await route.fallback();
    });
    await page
      .getByRole("button", { name: "Start practicing", exact: true })
      .click();
    const question = await page.locator(".quick-question").innerText();
    await page.getByLabel("Your answer", { exact: true }).fill(answer);
    await page
      .getByRole("button", { name: "Get feedback", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "The server did not confirm this save",
    );
    await expect(page.locator(".quick-saved")).toContainText(
      "Save not confirmed",
    );
    await expect(
      page.getByText("Saved to your history", { exact: true }),
    ).toHaveCount(0);
    await page.getByText("Your question and answer", { exact: true }).click();
    await expect(page.locator(".quick-feedback .saved-answer")).toHaveText(
      answer,
    );
    const committed = (await (await page.request.get("/api/workspace")).json())
      .records;
    expect(committed).toHaveLength(1);
    expect(committed[0].data.id).toBe(ids[0]);
    expect(committed[0].data.answer).toBe(answer);
    await advancedWorkspace(page);
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      answer,
    );
    await expect(page.locator(".practice h2")).toHaveText(question);
    await page
      .getByRole("button", { name: "Quick practice", exact: true })
      .click();
    await expect(page.locator(".quick-saved")).toContainText(
      "Save not confirmed",
    );
    await page
      .getByRole("button", { name: "Retry saving answer", exact: true })
      .click();
    await expect(page.locator(".quick-saved")).toHaveText(
      "Saved to your history",
    );
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    const records = (await (await page.request.get("/api/workspace")).json())
      .records;
    expect(records).toHaveLength(1);
    expect(records[0].data.answer).toBe(answer);
    await page.reload();
    await expect(
      page.getByText("Loading your saved workspace…", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Saved answers (1)", exact: true })
      .click();
    await page.locator(".quick-history-list > button").click();
    await expect(page.locator(".quick-next-step")).toHaveText(
      records[0].data.review.next,
    );
  });
}

test("an invalid load cannot partially replace the workspace and retry keeps the current answer", async ({
  page,
}) => {
  const profile = {
    role: "Synthetic engineer",
    company: "Example",
    resume: "Experience notes",
    job: "Build reliable tools",
  };
  const session = {
    id: randomUUID(),
    question: "Tell me about your project.",
    category: "Behavioral",
    answer,
    seconds: 0,
    createdAt: new Date().toISOString(),
  };
  for (const record of [
    { kind: "profile", data: profile },
    { kind: "session", data: session },
  ]) {
    expect(
      (await page.request.post("/api/workspace", { data: record })).ok(),
    ).toBeTruthy();
  }
  const before = (await (await page.request.get("/api/workspace")).json())
    .records;
  let loads = 0;
  let writes = 0;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "GET" && loads++ === 0) {
      return route.fulfill({
        json: {
          records: [
            { kind: "profile", data: profile },
            { kind: "session", data: { ...session, review: { score: 100 } } },
          ],
        },
      });
    }
    if (route.request().method() === "POST") writes++;
    await route.fallback();
  });
  await openQuickWorkspace(page);
  await expect(page.getByRole("alert")).toContainText(
    "Your saved workspace is unavailable",
  );
  await page
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("My current draft survives a retry.");
  await tab(page, "Role & resume");
  await expect(page.getByLabel("Role", { exact: true })).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Save profile", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry loading workspace", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    profile.role,
  );
  await page
    .getByRole("button", { name: "Quick practice", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "My current draft survives a retry.",
  );
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await expect(page.locator(".quick-history-list > button")).toHaveCount(1);
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toEqual(before);
  expect(writes).toBe(0);
});

test("mismatched profile and story acknowledgements keep edits until a matching retry", async ({
  page,
}) => {
  await openQuickWorkspace(page);
  const attempts: Record<string, string[]> = { profile: [], story: [] };
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") {
      const { kind, data } = route.request().postDataJSON();
      attempts[kind].push(data.id ?? "profile");
      if (attempts[kind].length === 1) {
        return route.fulfill({
          json: {
            data:
              kind === "profile"
                ? { ...data, role: "Wrong response role" }
                : { ...data, title: "Wrong response title" },
          },
        });
      }
    }
    await route.fallback();
  });
  await tab(page, "Role & resume");
  await page.getByLabel("Role", { exact: true }).fill("  Synthetic QA lead  ");
  await page
    .getByLabel("Resume or experience notes")
    .fill("  Preserve these experience notes.\n");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "The server did not confirm this save",
  );
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "  Synthetic QA lead  ",
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Role and resume saved.",
  );
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "Synthetic QA lead",
  );
  await tab(page, "Story library");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await page.getByLabel("Story title").fill("  My synthetic project  ");
  await page
    .getByLabel("R · Result")
    .fill("We reduced failures by 20 percent.");
  await page.getByRole("button", { name: "Save story", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "The server did not confirm this save",
  );
  await expect(page.getByLabel("Story title")).toHaveValue(
    "  My synthetic project  ",
  );
  await expect(page.getByLabel("R · Result")).toHaveValue(
    "We reduced failures by 20 percent.",
  );
  await page.getByRole("button", { name: "Save story", exact: true }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "My synthetic project" }),
  ).toBeVisible();
  expect(attempts.story).toHaveLength(2);
  expect(attempts.story[0]).toBe(attempts.story[1]);
  const records = (await (await page.request.get("/api/workspace")).json())
    .records;
  expect(records).toHaveLength(2);
  expect(
    records.find((r: { kind: string }) => r.kind === "profile").data.resume,
  ).toBe("  Preserve these experience notes.\n");
  expect(
    records.find((r: { kind: string }) => r.kind === "story").data.title,
  ).toBe("My synthetic project");
});

test("an unconfirmed deletion keeps its visible record and can be safely retried", async ({
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
  await page
    .getByRole("button", { name: "Saved answers (1)", exact: true })
    .click();
  await page.locator(".quick-history-list > button").click();
  let deletions = 0;
  await page.route("**/api/workspace?*", async (route) => {
    if (route.request().method() === "DELETE" && deletions++ === 0) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      return route.fulfill({ response, json: {} });
    }
    await route.fallback();
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "The server did not confirm deletion",
  );
  await expect(page.locator(".quick-answer-detail .saved-answer")).toHaveText(
    answer,
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).records,
  ).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete answer", exact: true })
    .click();
  await expect(page.locator(".quick-answer-detail")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Your first answer starts here.",
      exact: true,
    }),
  ).toBeVisible();
  expect(deletions).toBe(2);
});
