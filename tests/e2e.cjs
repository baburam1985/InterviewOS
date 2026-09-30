// Backwards-compatible entry point; dependencies and browser are now portable.
(async () => {
  const { spawnSync } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const { resolve } = await import("node:path");
  const require = createRequire(__filename);
  const result = spawnSync(
    process.execPath,
    [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)],
    { cwd: resolve(__dirname, ".."), stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
