import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const project = fileURLToPath(new URL("../../", import.meta.url));
const safeEnv = {
  ...process.env,
  CI: "true",
  INTERVIEWOS_E2E: "",
  OPENAI_API_KEY: "",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
};
// Keep runtime logs and registries in the temporary fixture. Installed
// dependencies are linked, so framework dependency caches may be shared.
for (const name of [
  "SITES_RUNTIME_ROOT",
  "WRANGLER_LOG_PATH",
  "WRANGLER_REGISTRY_PATH",
  "MINIFLARE_REGISTRY_PATH",
])
  delete safeEnv[name];
function temporaryProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), "interviewos-startup-"));
  try {
    const files = [
      "app",
      "build",
      "components",
      "db",
      "drizzle",
      "hooks",
      "lib",
      "public",
      "scripts",
      "vendor",
      "package.json",
      "vite.config.ts",
      "next.config.ts",
      "postcss.config.mjs",
      "tsconfig.json",
      "cloudflare-env.d.ts",
    ];
    for (const file of files)
      cpSync(path.join(project, file), path.join(root, file), {
        recursive: true,
      });
    mkdirSync(path.join(root, ".openai"));
    cpSync(
      path.join(project, ".openai/hosting.json"),
      path.join(root, ".openai/hosting.json"),
    );
    symlinkSync(
      path.join(project, "node_modules"),
      path.join(root, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function launch(root, port) {
  const child = spawn(
    process.execPath,
    [
      path.join(project, "tests/startup/fixture-entry.mjs"),
      path.join(root, "scripts/start-local.mjs"),
      "--port",
      String(port),
    ],
    { cwd: root, env: safeEnv, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const running = { child, output: "", error: null };
  child.stdout.on("data", (chunk) => {
    running.output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    running.output += chunk;
  });
  child.on("error", (error) => {
    running.error = error;
  });
  return running;
}
async function until(check, running, description, timeout = 90_000, signal) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    signal?.throwIfAborted();
    if (running.error) throw running.error;
    if (
      Date.now() >= deadline ||
      running.child.exitCode !== null ||
      running.child.signalCode !== null
    )
      throw new Error(`${description}\n${running.output.slice(-6000)}`);
    await delay(100);
  }
}
async function stop(running) {
  if (
    !running ||
    running.child.exitCode !== null ||
    running.child.signalCode !== null
  )
    return;
  if (running.child.connected) running.child.send("stop-local-test-server");
  else running.child.kill("SIGTERM");
  const deadline = Date.now() + 15_000;
  while (
    running.child.exitCode === null &&
    running.child.signalCode === null &&
    Date.now() < deadline
  )
    await delay(100);
  if (running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill("SIGKILL");
    await new Promise((resolve) => running.child.once("exit", resolve));
    throw new Error("The local server did not stop cleanly.");
  }
}

test(
  "clean local startup saves synthetic records, reports occupied ports and keeps records after restart",
  { timeout: 180_000 },
  async (t) => {
    const root = temporaryProject();
    const children = [];
    try {
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const localFetch = (url, options = {}) =>
        fetch(url, {
          ...options,
          signal: AbortSignal.any([t.signal, AbortSignal.timeout(15_000)]),
        });
      let first;
      let restarted;
      let occupied;
      first = launch(root, port);
      children.push(first);
      await until(
        () => first.output.includes("InterviewOS is ready on this computer."),
        first,
        "First startup failed",
        90_000,
        t.signal,
      );
      assert.match(
        first.output,
        new RegExp(
          `http://127\\.0\\.0\\.1:${port}/signin-with-chatgpt\\?return_to=/`,
        ),
      );
      assert.ok(existsSync(path.join(root, ".wrangler/state")));
      assert.equal(existsSync(path.join(root, ".wrangler/test-state")), false);
      assert.equal((await localFetch(`${base}/api/workspace`)).status, 401);
      const login = await localFetch(
        `${base}/signin-with-chatgpt?return_to=/`,
        {
          redirect: "manual",
        },
      );
      assert.equal(login.status, 302);
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      assert.ok(cookie);
      const headers = {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
      };
      const getRecords = async () => {
        const response = await localFetch(`${base}/api/workspace`, { headers });
        assert.equal(response.status, 200);
        return (await response.json()).records;
      };
      assert.deepEqual(await getRecords(), []);
      for (const record of [
        {
          kind: "profile",
          data: {
            role: "Synthetic tester",
            company: "Example",
            resume: "Synthetic notes",
            job: "Synthetic role",
          },
        },
        {
          kind: "story",
          data: {
            id: randomUUID(),
            title: "Synthetic story",
            tag: "Leadership",
            situation: "A test project",
            task: "Check startup",
            action: "I restarted the app",
            result: "Saved records remained",
          },
        },
        {
          kind: "session",
          data: {
            id: randomUUID(),
            question: "Tell me about yourself.",
            category: "Recruiter",
            answer: "I test local startup and explain what I found.",
            seconds: 0,
            createdAt: "2026-09-30T00:00:00.000Z",
          },
        },
      ]) {
        const response = await localFetch(`${base}/api/workspace`, {
          method: "POST",
          headers,
          body: JSON.stringify(record),
        });
        assert.equal(response.status, 200, await response.text());
      }
      const before = await getRecords();
      assert.equal(before.length, 3);
      occupied = launch(root, port);
      children.push(occupied);
      await until(
        () => occupied.child.exitCode !== null,
        occupied,
        "Occupied-port startup did not exit",
        15_000,
        t.signal,
      );
      assert.equal(occupied.child.exitCode, 1);
      assert.match(occupied.output, /port is already in use.*--port 5174/);
      assert.doesNotMatch(occupied.output, /Preparing local storage/);
      assert.deepEqual(await getRecords(), before);
      await stop(first);
      assert.equal(first.child.exitCode, 0);
      restarted = launch(root, port);
      children.push(restarted);
      await until(
        () =>
          restarted.output.includes("InterviewOS is ready on this computer."),
        restarted,
        "Restart failed",
        90_000,
        t.signal,
      );
      assert.deepEqual(await getRecords(), before);
      assert.equal((await localFetch(`${base}/api/coach`)).status, 200);
      assert.deepEqual(await (await localFetch(`${base}/api/coach`)).json(), {
        available: false,
      });
      const html = await (await localFetch(base)).text();
      assert.match(html, /Your next great answer/);
      await stop(restarted);
      assert.equal(restarted.child.exitCode, 0);
    } finally {
      const stopped = await Promise.allSettled(children.map(stop));
      const failure = stopped.find((result) => result.status === "rejected");
      // Keep removal after shutdown even if node:test has already timed out.
      rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
      if (failure) throw failure.reason;
    }
  },
);

test("help and missing-dependency errors work in a clean copy without creating local state", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "interviewos-startup-help-"));
  try {
    cpSync(path.join(project, "scripts"), path.join(root, "scripts"), {
      recursive: true,
    });
    for (const [args, status, pattern] of [
      [["--help"], 0, /npm run dev:local.*[\s\S]*Records remain/],
      [[], 1, /Dependencies are missing.*Run npm ci/],
      [["--remote"], 1, /Only --port and --help are supported/],
    ]) {
      const result = spawnSync(
        process.execPath,
        ["scripts/start-local.mjs", ...args],
        { cwd: root, env: safeEnv, encoding: "utf8", timeout: 10_000 },
      );
      assert.equal(result.status, status, result.stderr);
      assert.match(result.stdout + result.stderr, pattern);
      assert.equal(existsSync(path.join(root, ".wrangler")), false);
      assert.equal(existsSync(path.join(root, ".sites-runtime")), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
