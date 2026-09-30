import { rmSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";
import { migrateLocal } from "./migrate-local.mjs";

const port = Number(process.env.E2E_PORT || "4173");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("E2E_PORT must be between 1024 and 65535.");
process.env.INTERVIEWOS_E2E = "1";
process.env.OPENAI_API_KEY = "";
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "false";
// The suite never uses a developer's normal .wrangler/state database.
rmSync(path.join(projectRoot, ".wrangler/test-state"), {
  recursive: true,
  force: true,
});
await migrateLocal({ test: true });

const { createServer } = await import("vite");
const server = await createServer({
  root: projectRoot,
  mode: "test",
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
