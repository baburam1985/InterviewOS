import assert from "node:assert/strict";
import { test } from "node:test";
import { localStartOptions } from "../../scripts/local-start-options.mjs";

test("local startup accepts the supported Node boundary and a bounded custom port", () => {
  for (const node of ["22.13.0", "22.21.1", "24.19.0"])
    assert.deepEqual(localStartOptions([], node), { help: false, port: 5173 });
  assert.deepEqual(localStartOptions(["--port", "5174"], "24.0.0"), {
    help: false,
    port: 5174,
  });
  for (const port of ["1024", "65535"])
    assert.equal(
      localStartOptions(["--port", port], "22.13.0").port,
      Number(port),
    );
});

test("old or invalid Node versions give an actionable error before starting tools", () => {
  for (const node of ["20.19.0", "22.12.9", "18.0.0", "invalid"])
    assert.throws(
      () => localStartOptions([], node),
      /Use Node.js 22.13 or newer.*npm ci/,
    );
});

test("startup rejects remote, host, reset, ambiguous and invalid port options", () => {
  for (const args of [
    ["--remote"],
    ["--host", "0.0.0.0"],
    ["--reset"],
    ["--port"],
    ["--port", "5173", "--port", "5174"],
    ["--port", "5e3"],
    ["--port", "5174x"],
    ["--port", "0"],
    ["--port", "65536"],
    ["--port", "-1"],
  ])
    assert.throws(() => localStartOptions(args, "24.0.0"));
});

test("help is available even when the Node version cannot run the app", () => {
  assert.deepEqual(localStartOptions(["--help"], "20.0.0"), { help: true });
  assert.throws(() => localStartOptions(["--help", "--remote"], "24.0.0"));
});
