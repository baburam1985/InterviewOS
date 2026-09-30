import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";
import {
  localDatabaseId,
  initialMigration,
  schemaQuery,
  hasRecognizedLedger,
  localMigrationPlan,
  adoptionStatements,
} from "./legacy-local-schema.mjs";

export async function inspectLocalSchema(db) {
  const results = await db.batch(
    schemaQuery
      .split(";")
      .filter((sql) => sql.trim())
      .map((sql) => db.prepare(sql)),
  );
  if (
    results.length !== 5 ||
    results.some((result) => !result.success || !Array.isArray(result.results))
  )
    throw new Error(
      "Could not inspect the local database. No adoption was performed.",
    );
  const [
    objects,
    recordsColumns,
    recordsIndexes,
    ledgerColumns,
    ledgerIndexes,
  ] = results.map((result) => result.results);
  return {
    objects,
    recordsColumns,
    recordsIndexes,
    ledgerColumns,
    ledgerIndexes,
  };
}

async function reconcileLegacyLocal(db, runtimeDirectory) {
  const snapshot = await inspectLocalSchema(db);
  const appliedNames = hasRecognizedLedger(snapshot)
    ? (
        await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()
      ).results.map((row) => row.name)
    : [];
  const migrationsDirectory = path.join(projectRoot, "drizzle");
  const plan = localMigrationPlan(
    snapshot,
    appliedNames,
    readFileSync(path.join(migrationsDirectory, initialMigration), "utf8"),
    readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")),
  );
  if (plan !== "adopt") return;

  // Use the SAME explicit Miniflare binding for backup and adoption. Wrangler's
  // `d1 export --local` uses its default path, ignoring our persist-to selection.
  const dump = await db
    .prepare("PRAGMA miniflare_d1_export(?,?,?);")
    .bind(false, false)
    .raw();
  if (
    dump.length !== 1 ||
    !Array.isArray(dump[0]) ||
    !dump[0].length ||
    dump[0].some((line) => typeof line !== "string")
  )
    throw new Error(
      "Local backup could not be created. No adoption was performed.",
    );
  const backup = dump[0].join("\n") + "\n";
  const backupDirectory = path.join(runtimeDirectory, "backups");
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backupPath = path.join(
    backupDirectory,
    `before-legacy-adoption-${randomUUID()}.sql`,
  );
  writeFileSync(backupPath, backup, { flag: "wx", mode: 0o600 });
  if (readFileSync(backupPath, "utf8") !== backup)
    throw new Error(
      "Local backup verification failed. No adoption was performed.",
    );
  console.log(`Private local backup: ${backupPath}`);
  try {
    // D1 batch is transactional: a changed schema/history trips the CHECK and
    // rolls back every statement, including any newly-created ledger.
    await db.batch(adoptionStatements(snapshot).map((sql) => db.prepare(sql)));
  } catch {
    throw new Error(
      "Legacy adoption stopped because the schema or migration history changed. Records were not modified. Keep the backup and .wrangler/state, stop local servers, and retry after reviewing the database.",
    );
  }
  console.log(
    `Recognized the existing local schema; recorded ${initialMigration} without changing records.`,
  );
}

/** Apply checked-in migrations to local D1 only; no remote flag is accepted. */
export async function migrateLocal({ test = false } = {}) {
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
            database_id: localDatabaseId,
            migrations_dir: path.join(projectRoot, "drizzle"),
          },
        ],
      },
      null,
      2,
    ),
  );

  const persistPath = path.join(
    projectRoot,
    ".wrangler",
    test ? "test-state" : "state",
  );
  // Resolve the engine bundled with our pinned Wrangler rather than another
  // globally installed version. No remote database or credentials are used.
  const requireWrangler = createRequire(
    path.join(projectRoot, "node_modules/wrangler/package.json"),
  );
  const { Miniflare } = requireWrangler("miniflare");
  const local = new Miniflare({
    modules: true,
    script: "",
    d1Persist: path.join(persistPath, "v3", "d1"),
    d1Databases: { DATABASE: localDatabaseId },
  });
  try {
    await reconcileLegacyLocal(
      await local.getD1Database("DATABASE"),
      runtimeDirectory,
    );
  } finally {
    await local.dispose();
  }

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
      persistPath,
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
  await migrateLocal();
}
