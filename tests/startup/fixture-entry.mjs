import { pathToFileURL } from "node:url";

// Test-only IPC lets Windows exercise the same graceful handler as Ctrl+C.
// Sending an OS SIGTERM to a Windows subprocess terminates it immediately.
const [entry, ...args] = process.argv.slice(2);
process.argv = [process.execPath, entry, ...args];
let loaded = false;
let stopRequested = false;
function requestStop() {
  if (loaded) process.emit("SIGTERM");
  else stopRequested = true;
}
process.on("message", (message) => {
  if (message === "stop-local-test-server") requestStop();
});
process.on("disconnect", requestStop);
await import(pathToFileURL(entry).href);
loaded = true;
if (stopRequested) requestStop();
