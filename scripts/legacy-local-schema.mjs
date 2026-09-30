import { createHash } from "node:crypto";
export const localDatabaseId = "00000000-0000-4000-8000-000000000000";
export const initialMigration = "0000_plain_vampiro.sql";
export const legacyRecordsSql = `CREATE TABLE \`records\` (
  \`user_id\` text NOT NULL,
  \`id\` text NOT NULL,
  \`kind\` text NOT NULL,
  \`data\` text NOT NULL,
  \`created_at\` text NOT NULL,
  PRIMARY KEY(\`user_id\`, \`id\`)
);`;
export const migrationLedgerSql = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;
export const schemaQuery = `SELECT type,name,tbl_name,sql FROM sqlite_master
WHERE tbl_name IN ('records','d1_migrations') OR name IN ('records','d1_migrations')
ORDER BY type,name;
PRAGMA table_xinfo('records');
PRAGMA index_list('records');
PRAGMA table_xinfo('d1_migrations');
PRAGMA index_list('d1_migrations');`;

const stopMessage =
  "Local database schema or migration history is not recognized. No adoption was performed. Keep .wrangler/state intact, stop local servers, and review the schema before retrying; do not reset the database.";
const fail = () => {
  throw new Error(stopMessage);
};
const normalize = (sql) =>
  typeof sql === "string"
    ? sql
        .replace(/\s+/g, " ")
        .trim()
        .replace(/;$/, "")
        .trim()
        .toLowerCase()
        .replace(/^create table if not exists /, "create table ")
    : null;
const quote = (value) => "'" + value.replace(/'/g, "''") + "'";
const fields = (columns) =>
  columns.map(({ cid, name, type, notnull, dflt_value, pk, hidden }) => [
    cid,
    name,
    type.toUpperCase(),
    notnull,
    dflt_value,
    pk,
    hidden,
  ]);
function matchesTable(snapshot, name, sql, expectedColumns, indexName, origin) {
  const objects = snapshot.objects.filter(
    (object) => object.tbl_name === name || object.name === name,
  );
  const columns =
    name === "records" ? snapshot.recordsColumns : snapshot.ledgerColumns;
  const indexes =
    name === "records" ? snapshot.recordsIndexes : snapshot.ledgerIndexes;
  return (
    objects.length === 2 &&
    objects.some(
      (object) =>
        object.type === "table" &&
        object.name === name &&
        normalize(object.sql) === normalize(sql),
    ) &&
    objects.some(
      (object) =>
        object.type === "index" &&
        object.name === indexName &&
        object.sql === null,
    ) &&
    JSON.stringify(fields(columns)) === JSON.stringify(expectedColumns) &&
    indexes.length === 1 &&
    indexes[0].name === indexName &&
    indexes[0].unique === 1 &&
    indexes[0].origin === origin &&
    indexes[0].partial === 0
  );
}
export function hasRecognizedLedger(snapshot) {
  const objects = snapshot.objects.filter(
    (object) =>
      object.tbl_name === "d1_migrations" || object.name === "d1_migrations",
  );
  if (!objects.length) {
    if (snapshot.ledgerColumns.length || snapshot.ledgerIndexes.length) fail();
    return false;
  }
  if (
    !matchesTable(
      snapshot,
      "d1_migrations",
      migrationLedgerSql,
      [
        [0, "id", "INTEGER", 0, null, 1, 0],
        [1, "name", "TEXT", 0, null, 0, 0],
        [2, "applied_at", "TIMESTAMP", 1, "CURRENT_TIMESTAMP", 0, 0],
      ],
      "sqlite_autoindex_d1_migrations_1",
      "u",
    )
  )
    fail();
  return true;
}

/** Only adopt the original exact schema, never infer that later DDL ran. */
export function localMigrationPlan(
  snapshot,
  appliedNames,
  migrationSql,
  knownNames,
) {
  hasRecognizedLedger(snapshot);
  if (
    !Array.isArray(appliedNames) ||
    appliedNames.some(
      (name) => typeof name !== "string" || !knownNames.includes(name),
    ) ||
    new Set(appliedNames).size !== appliedNames.length
  )
    fail();
  const records = snapshot.objects.filter(
    (object) => object.tbl_name === "records" || object.name === "records",
  );
  if (!records.length) {
    if (
      appliedNames.length ||
      snapshot.recordsColumns.length ||
      snapshot.recordsIndexes.length
    )
      fail();
    return "fresh";
  }
  if (appliedNames.includes(initialMigration)) {
    if (
      !records.some(
        (object) => object.type === "table" && object.name === "records",
      )
    )
      fail();
    return "tracked";
  }
  if (
    appliedNames.length ||
    createHash("sha256")
      .update(migrationSql.replace(/\r\n/g, "\n"))
      .digest("hex") !==
      "761e7d71d255a0f34399386c1494802c19e7d8ed70eb2d10bb79b516be66cb55" ||
    !matchesTable(
      snapshot,
      "records",
      legacyRecordsSql,
      [
        [0, "user_id", "TEXT", 1, null, 1, 0],
        [1, "id", "TEXT", 1, null, 2, 0],
        [2, "kind", "TEXT", 1, null, 0, 0],
        [3, "data", "TEXT", 1, null, 0, 0],
        [4, "created_at", "TEXT", 1, null, 0, 0],
      ],
      "sqlite_autoindex_records_1",
      "pk",
    )
  )
    fail();
  return "adopt";
}

/** Wrangler executes these statements as one atomic D1 batch. */
export function adoptionStatements(snapshot) {
  const unchanged = [
    `(SELECT COUNT(*) FROM sqlite_master WHERE tbl_name IN ('records','d1_migrations') OR name IN ('records','d1_migrations')) = ${snapshot.objects.length}`,
    ...snapshot.objects.map(
      (object) =>
        `EXISTS(SELECT 1 FROM sqlite_master WHERE type=${quote(object.type)} AND name=${quote(object.name)} AND tbl_name=${quote(object.tbl_name)} AND sql ${object.sql === null ? "IS NULL" : "=" + quote(object.sql)})`,
    ),
  ].join(" AND ");
  return [
    "CREATE TABLE __interviewos_adoption_guard(valid INTEGER NOT NULL CHECK(valid=1))",
    `INSERT INTO __interviewos_adoption_guard SELECT CASE WHEN ${unchanged} THEN 1 ELSE 0 END`,
    migrationLedgerSql,
    "INSERT INTO __interviewos_adoption_guard SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d1_migrations) THEN 1 ELSE 0 END",
    `INSERT INTO d1_migrations(name) VALUES (${quote(initialMigration)})`,
    "DROP TABLE __interviewos_adoption_guard",
  ];
}
