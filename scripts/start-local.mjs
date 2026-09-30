import { accessSync } from "node:fs";
import { createServer as createPortProbe } from "node:net";
import { fileURLToPath } from "node:url";
import { localStartHelp, localStartOptions } from "./local-start-options.mjs";
import { readExecutionProfile } from "./execution-profile.mjs";

let server;
try {
  const options = localStartOptions(process.argv.slice(2));
  if (options.help) {
    console.log(localStartHelp);
  } else {
    if (readExecutionProfile() !== "portable")
      throw new Error(
        "This command is for a portable local checkout. Use npm run dev for the configured managed preview, or use a separate clean clone for local practice.",
      );
    if (process.env.INTERVIEWOS_E2E)
      throw new Error(
        "Unset INTERVIEWOS_E2E before local practice. Use npm run test:e2e for the isolated test database.",
      );
    for (const dependency of [
      "vite/package.json",
      "vinext/package.json",
      "@cloudflare/vite-plugin/package.json",
      "wrangler/bin/wrangler.js",
    ]) {
      try {
        accessSync(
          fileURLToPath(
            new URL(`../node_modules/${dependency}`, import.meta.url),
          ),
        );
      } catch {
        throw new Error(
          "Dependencies are missing or incomplete. Run npm ci in this checkout, then npm run dev:local.",
        );
      }
    }
    const { port } = options;
    // Fail before migrations if this URL already belongs to another process.
    await new Promise((resolve, reject) => {
      const probe = createPortProbe();
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
    const { projectRoot } = await import("./sites-env.mjs");
    const { migrateLocal } = await import("./migrate-local.mjs");
    console.log(
      "Preparing local storage in .wrangler/state (existing records are kept)…",
    );
    await migrateLocal();
    const { createServer } = await import("vite");
    server = await createServer({
      root: projectRoot,
      server: { host: "127.0.0.1", port, strictPort: true },
    });
    await server.listen();
    console.log(
      `\nInterviewOS is ready on this computer.\nPractice: http://127.0.0.1:${port}/\nSave locally with the development account: http://127.0.0.1:${port}/signin-with-chatgpt?return_to=/\nLocal records: .wrangler/state\nStop with Ctrl+C. Restart with the same command to keep practicing.\n`,
    );
    let stopping = false;
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, async () => {
        if (stopping) return;
        stopping = true;
        await server.close();
        console.log(
          "Local server stopped. Saved records remain in .wrangler/state.",
        );
        process.exit(0);
      });
    }
  }
} catch (error) {
  await server?.close();
  const message =
    error.code === "EADDRINUSE" ||
    /Port \d+ is already in use/.test(error.message)
      ? "That port is already in use. Stop the other server or choose another port, for example npm run dev:local -- --port 5174."
      : error.message;
  console.error(`Local startup failed: ${message}`);
  process.exit(1);
}
