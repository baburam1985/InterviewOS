import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  localDatabaseId,
  initialMigration,
  migrationLedgerSql,
  adoptionStatements,
  schemaQuery,
} from "../../scripts/legacy-local-schema.mjs";
const project = fileURLToPath(new URL("../../", import.meta.url));
const { Miniflare } = createRequire(
  path.join(project, "node_modules/wrangler/package.json"),
)("miniflare");
const initialSql = readFileSync(
  path.join(project, "drizzle", initialMigration),
  "utf8",
);
const privateText = "DO_NOT_PRINT_SYNTHETIC_DATA café 🧪 ' preserved";
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "interviewos-legacy-"));
  for (const name of ["scripts", "drizzle"])
    cpSync(path.join(project, name), path.join(root, name), {
      recursive: true,
    });
  symlinkSync(
    path.join(project, "node_modules"),
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return root;
}
async function withDatabase(root, run, alternate = false) {
  const persist = alternate
    ? path.join(root, ".sites-runtime/.wrangler/state")
    : path.join(root, ".wrangler/state");
  const mf = new Miniflare({
    modules: true,
    script: "",
    d1Persist: path.join(persist, "v3/d1"),
    d1Databases: { DATABASE: localDatabaseId },
  });
  try {
    return await run(await mf.getD1Database("DATABASE"));
  } finally {
    await mf.dispose();
  }
}
function migrate(root) {
  const env = {
    ...process.env,
    CI: "true",
    OPENAI_API_KEY: "",
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };
  for (const name of [
    "SITES_RUNTIME_ROOT",
    "WRANGLER_LOG_PATH",
    "WRANGLER_REGISTRY_PATH",
    "MINIFLARE_REGISTRY_PATH",
  ])
    delete env[name];
  return spawnSync(process.execPath, ["scripts/migrate-local.mjs"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 90_000,
  });
}
async function rows(db) {
  return (await db.prepare("SELECT * FROM records ORDER BY user_id,id").all())
    .results;
}
async function names(db) {
  return (
    await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()
  ).results.map((row) => row.name);
}
async function seed(db, marker = privateText) {
  await db.prepare(initialSql).run();
  await db
    .prepare("INSERT INTO records VALUES (?,?,?,?,?)")
    .bind("synthetic-user", "synthetic-id", "profile", marker, "2026-09-30")
    .run();
}

for (const ledger of ["missing", "empty"]) {
  test(
    `real local migration adopts a ${ledger} ledger with an exact restorable private backup and unchanged rows`,
    { timeout: 120_000 },
    async () => {
      const root = fixture();
      try {
        const before = await withDatabase(root, async (db) => {
          await seed(db);
          if (ledger === "empty") await db.prepare(migrationLedgerSql).run();
          return rows(db);
        });
        // A different default-path database catches accidental backup path selection.
        await withDatabase(root, (db) => seed(db, "WRONG DATABASE"), true);
        const result = migrate(root);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /Recognized the existing local schema/);
        assert.doesNotMatch(
          result.stdout + result.stderr,
          /DO_NOT_PRINT_SYNTHETIC_DATA|WRONG DATABASE/,
        );
        await withDatabase(root, async (db) => {
          assert.deepEqual(await rows(db), before);
          assert.deepEqual(await names(db), [initialMigration]);
          assert.deepEqual(
            (
              await db
                .prepare(
                  "SELECT name FROM sqlite_master WHERE name='__interviewos_adoption_guard'",
                )
                .all()
            ).results,
            [],
          );
        });
        await withDatabase(
          root,
          async (db) => {
            assert.equal((await rows(db))[0].data, "WRONG DATABASE");
          },
          true,
        );
        const directory = path.join(root, ".sites-runtime/backups");
        const backups = readdirSync(directory);
        assert.equal(backups.length, 1);
        const backupPath = path.join(directory, backups[0]);
        if (process.platform !== "win32") {
          assert.equal(statSync(backupPath).mode & 0o777, 0o600);
          assert.equal(statSync(directory).mode & 0o777, 0o700);
        }
        const restored = new DatabaseSync(":memory:");
        try {
          restored.exec(readFileSync(backupPath, "utf8"));
          assert.deepEqual(
            JSON.parse(
              JSON.stringify(
                restored
                  .prepare("SELECT * FROM records ORDER BY user_id,id")
                  .all(),
              ),
            ),
            before,
          );
          if (ledger === "empty")
            assert.deepEqual(
              restored.prepare("SELECT name FROM d1_migrations").all(),
              [],
            );
          else
            assert.equal(
              restored
                .prepare(
                  "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
                )
                .get(),
              undefined,
            );
        } finally {
          restored.close();
        }
        const repeated = migrate(root);
        assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
        assert.doesNotMatch(
          repeated.stdout,
          /Recognized the existing local schema/,
        );
        assert.equal(readdirSync(directory).length, 1);
        await withDatabase(root, async (db) => {
          assert.deepEqual(await rows(db), before);
          assert.deepEqual(await names(db), [initialMigration]);
        });
      } finally {
        rmSync(root, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    },
  );
}

test(
  "an unrecognized local schema fails closed without adding history, backup or changing records",
  { timeout: 90_000 },
  async () => {
    const root = fixture();
    try {
      const before = await withDatabase(root, async (db) => {
        await seed(db);
        await db
          .prepare("CREATE INDEX unexpected_index ON records(kind)")
          .run();
        return rows(db);
      });
      const result = migrate(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not recognized.*No adoption was performed/);
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /DO_NOT_PRINT_SYNTHETIC_DATA/,
      );
      assert.equal(
        existsSync(path.join(root, ".sites-runtime/backups")),
        false,
      );
      await withDatabase(root, async (db) => {
        assert.deepEqual(await rows(db), before);
        assert.deepEqual(
          (
            await db
              .prepare(
                "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
              )
              .all()
          ).results,
          [],
        );
        assert.equal(
          (await db.prepare("PRAGMA index_list(records)").all()).results.length,
          2,
        );
      });
    } finally {
      rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);

test(
  "real D1 batches roll back a raced schema or ledger without partial adoption",
  { timeout: 90_000 },
  async () => {
    for (const changed of ["schema", "ledger"]) {
      const root = fixture();
      try {
        await withDatabase(root, async (db) => {
          await seed(db);
          if (changed === "ledger") await db.prepare(migrationLedgerSql).run();
          const responses = await db.batch(
            schemaQuery
              .split(";")
              .filter((sql) => sql.trim())
              .map((sql) => db.prepare(sql)),
          );
          const [
            objects,
            recordsColumns,
            recordsIndexes,
            ledgerColumns,
            ledgerIndexes,
          ] = responses.map((response) => response.results);
          const observed = {
            objects,
            recordsColumns,
            recordsIndexes,
            ledgerColumns,
            ledgerIndexes,
          };
          const before = await rows(db);
          if (changed === "schema")
            await db
              .prepare("CREATE INDEX racing_index ON records(kind)")
              .run();
          else
            await db
              .prepare("INSERT INTO d1_migrations(name) VALUES (?)")
              .bind(initialMigration)
              .run();
          await assert.rejects(
            db.batch(
              adoptionStatements(observed).map((sql) => db.prepare(sql)),
            ),
            /CHECK constraint failed/,
          );
          assert.deepEqual(await rows(db), before);
          assert.deepEqual(
            (
              await db
                .prepare(
                  "SELECT name FROM sqlite_master WHERE name='__interviewos_adoption_guard'",
                )
                .all()
            ).results,
            [],
          );
          if (changed === "ledger")
            assert.deepEqual(await names(db), [initialMigration]);
          else
            assert.deepEqual(
              (
                await db
                  .prepare(
                    "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
                  )
                  .all()
              ).results,
              [],
            );
        });
      } finally {
        rmSync(root, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    }
  },
);

test(
  "an unavailable backup destination prevents ledger adoption and preserves records",
  { timeout: 90_000 },
  async () => {
    const root = fixture();
    try {
      const before = await withDatabase(root, async (db) => {
        await seed(db);
        return rows(db);
      });
      mkdirSync(path.join(root, ".sites-runtime"), { recursive: true });
      const blocked = path.join(root, ".sites-runtime/backups");
      writeFileSync(blocked, "Keep this existing file.");
      const result = migrate(root);
      assert.equal(result.status, 1);
      assert.doesNotMatch(
        result.stdout,
        /Recognized the existing local schema/,
      );
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /DO_NOT_PRINT_SYNTHETIC_DATA/,
      );
      assert.equal(readFileSync(blocked, "utf8"), "Keep this existing file.");
      await withDatabase(root, async (db) => {
        assert.deepEqual(await rows(db), before);
        assert.deepEqual(
          (
            await db
              .prepare(
                "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
              )
              .all()
          ).results,
          [],
        );
      });
    } finally {
      rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);
