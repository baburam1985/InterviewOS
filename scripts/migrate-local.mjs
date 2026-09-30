import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";

/** Apply checked-in migrations to local D1 only; no remote flag is accepted. */
export function migrateLocal({ test = false } = {}) {
  const runtimeDirectory = path.join(projectRoot, ".sites-runtime");
  mkdirSync(runtimeDirectory, { recursive: true });
  const configPath = path.join(runtimeDirectory, "local-database.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        name: "interviewos-local",
        compatibility_date: "2026-05-15",
        d1_databases: [
          {
            binding: "DB",
            database_name: "site-creator-d1",
            database_id: "00000000-0000-4000-8000-000000000000",
            migrations_dir: path.join(projectRoot, "drizzle"),
          },
        ],
      },
      null,
      2,
    ),
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      path.join(projectRoot, ".wrangler", test ? "test-state" : "state"),
    ],
    { cwd: projectRoot, stdio: "inherit", env: { ...process.env, CI: "true" } },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Local D1 migration failed (${result.status}).`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length > 2)
    throw new Error(
      "This command accepts no arguments and only migrates local D1.",
    );
  migrateLocal();
}
