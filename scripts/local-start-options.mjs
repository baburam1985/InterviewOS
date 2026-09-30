export const localStartHelp = `Start InterviewOS on this computer:
  npm run dev:local
  npm run dev:local -- --port 5174

Requires Node.js 22.13 or newer and npm ci first.
Applies local migrations without resetting saved records, then serves on
127.0.0.1. Records remain in .wrangler/state after stopping or restarting.
This command does not deploy or open a browser.`;

export function localStartOptions(args, nodeVersion = process.versions.node) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  const [major, minor] = nodeVersion.split(".").map(Number);
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    major < 22 ||
    (major === 22 && minor < 13)
  )
    throw new Error(
      `Node.js ${nodeVersion} is unsupported. Use Node.js 22.13 or newer (Node 24 LTS recommended), run npm ci, then npm run dev:local.`,
    );
  if (
    args.length !== 0 &&
    (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))
  )
    throw new Error(
      "Use npm run dev:local, or npm run dev:local -- --port 5174. Only --port and --help are supported.",
    );
  const port = args.length ? Number(args[1]) : 5173;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Choose a port between 1024 and 65535.");
  return { help: false, port };
}
