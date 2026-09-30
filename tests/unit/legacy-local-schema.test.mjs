import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  initialMigration,
  hasRecognizedLedger,
  migrationLedgerSql,
  schemaQuery,
  localMigrationPlan,
  adoptionStatements,
} from "../../scripts/legacy-local-schema.mjs";
const initialSql = readFileSync(
  new URL("../../drizzle/0000_plain_vampiro.sql", import.meta.url),
  "utf8",
);
const known = [initialMigration, "0001_future.sql"];
function snapshot(db) {
  const [
    objects,
    recordsColumns,
    recordsIndexes,
    ledgerColumns,
    ledgerIndexes,
  ] = schemaQuery
    .split(";")
    .filter((sql) => sql.trim())
    .map((sql) => db.prepare(sql).all());
  return {
    objects,
    recordsColumns,
    recordsIndexes,
    ledgerColumns,
    ledgerIndexes,
  };
}
function names(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE name='d1_migrations'")
    .get()
    ? db
        .prepare("SELECT name FROM d1_migrations ORDER BY id")
        .all()
        .map((row) => row.name)
    : [];
}
function plan(db, sql = initialSql) {
  const observed = snapshot(db);
  return localMigrationPlan(
    observed,
    hasRecognizedLedger(observed) ? names(db) : [],
    sql,
    known,
  );
}
function transaction(db, statements) {
  db.exec("BEGIN");
  try {
    for (const sql of statements) db.exec(sql);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function seed(db) {
  db.exec(initialSql);
  db.prepare("INSERT INTO records VALUES (?,?,?,?,?)").run(
    "synthetic-user",
    "synthetic-record",
    "profile",
    "Do not change café 🧪 ' data",
    "2026-09-30",
  );
}

test("fresh and already tracked databases continue normal migrations without adoption", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.equal(plan(db), "fresh");
    db.exec(migrationLedgerSql);
    assert.equal(plan(db), "fresh");
    seed(db);
    db.prepare("INSERT INTO d1_migrations(name) VALUES (?)").run(
      initialMigration,
    );
    db.exec("ALTER TABLE records ADD COLUMN future_column TEXT");
    db.prepare(
      "INSERT INTO d1_migrations(name) VALUES ('0001_future.sql')",
    ).run();
    assert.equal(plan(db), "tracked");
  } finally {
    db.close();
  }
});
test("exact legacy schema is adopted once with either a missing or empty ledger and records preserved", () => {
  for (const ledger of [false, true]) {
    const db = new DatabaseSync(":memory:");
    try {
      seed(db);
      if (ledger) db.exec(migrationLedgerSql);
      const before = db.prepare("SELECT * FROM records").all();
      assert.equal(plan(db), "adopt");
      assert.equal(plan(db, initialSql.replace(/\n/g, "\r\n")), "adopt");
      transaction(db, adoptionStatements(snapshot(db)));
      assert.deepEqual(names(db), [initialMigration]);
      assert.deepEqual(db.prepare("SELECT * FROM records").all(), before);
      assert.equal(plan(db), "tracked");
      assert.equal(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='__interviewos_adoption_guard'",
          )
          .get(),
        undefined,
      );
    } finally {
      db.close();
    }
  }
});
test("untracked altered columns, constraints, indexes and triggers fail without mutation", () => {
  for (const change of [
    "ALTER TABLE records ADD COLUMN extra TEXT",
    "CREATE INDEX extra_idx ON records(kind)",
    "CREATE TRIGGER extra_trigger AFTER INSERT ON records BEGIN SELECT 1; END",
    "ALTER TABLE records RENAME COLUMN kind TO record_kind",
  ]) {
    const db = new DatabaseSync(":memory:");
    try {
      seed(db);
      db.exec(change);
      const before = snapshot(db);
      assert.throws(() => plan(db), /not recognized/);
      assert.deepEqual(snapshot(db), before);
      assert.deepEqual(names(db), []);
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM records").get().count,
        1,
      );
    } finally {
      db.close();
    }
  }
  for (const sql of [
    initialSql.replace("`kind` text NOT NULL", "`kind` text"),
    initialSql.replace(
      "PRIMARY KEY(`user_id`, `id`)",
      "PRIMARY KEY(`id`, `user_id`)",
    ),
    initialSql.replace("`kind` text", "`kind` integer"),
  ]) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(sql);
      assert.throws(() => plan(db), /not recognized/);
    } finally {
      db.close();
    }
  }
});
test("changed migration tokens, malformed ledgers and unknown or partial history cannot be marked applied", () => {
  const db = new DatabaseSync(":memory:");
  try {
    seed(db);
    assert.throws(
      () => plan(db, initialSql.replace("text NOT NULL", "textNOTNULL")),
      /not recognized/,
    );
    assert.throws(
      () => plan(db, initialSql + "\nCREATE INDEX changed ON records(kind);"),
      /not recognized/,
    );
    db.exec("CREATE TABLE d1_migrations(name TEXT)");
    assert.throws(() => plan(db), /not recognized/);
    db.exec("DROP TABLE d1_migrations");
    db.exec(migrationLedgerSql);
    db.prepare("INSERT INTO d1_migrations(name) VALUES ('unknown.sql')").run();
    assert.throws(() => plan(db), /not recognized/);
    db.exec("UPDATE d1_migrations SET name='0001_future.sql'");
    assert.throws(() => plan(db), /not recognized/);
  } finally {
    db.close();
  }
});
test("a schema change after inspection fails the atomic guard without creating a ledger or changing records", () => {
  const db = new DatabaseSync(":memory:");
  try {
    seed(db);
    const observed = snapshot(db);
    const before = db.prepare("SELECT * FROM records").all();
    db.exec("CREATE INDEX changed_after_inspection ON records(kind)");
    assert.throws(
      () => transaction(db, adoptionStatements(observed)),
      /CHECK constraint failed/,
    );
    assert.deepEqual(db.prepare("SELECT * FROM records").all(), before);
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('d1_migrations','__interviewos_adoption_guard')",
        )
        .get(),
      undefined,
    );
  } finally {
    db.close();
  }
});
test("a ledger change after inspection rolls back adoption and preserves competing history", () => {
  const db = new DatabaseSync(":memory:");
  try {
    seed(db);
    db.exec(migrationLedgerSql);
    const observed = snapshot(db);
    db.prepare("INSERT INTO d1_migrations(name) VALUES (?)").run(
      initialMigration,
    );
    assert.throws(
      () => transaction(db, adoptionStatements(observed)),
      /CHECK constraint failed/,
    );
    assert.deepEqual(names(db), [initialMigration]);
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM records").get().count,
      1,
    );
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='__interviewos_adoption_guard'",
        )
        .get(),
      undefined,
    );
  } finally {
    db.close();
  }
});
