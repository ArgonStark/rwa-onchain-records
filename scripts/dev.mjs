// One command for the full local stack. `npm run dev` →
//   1. ensure the project-local Postgres cluster (.pgdata) is running, so our
//      owned time-series survives restarts (history charts read from it);
//   2. start `next dev`;
//   3. once it's serving, start the snapshot writer so we keep accumulating.
// Zero external deps. Ctrl-C stops next + writer; Postgres is left running so
// the data persists between sessions (use `npm run db:stop` to halt it).

import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PGDATA = path.join(root, ".pgdata");
const PORT = process.env.PORT || "3000";
const nextBin = path.join(root, "node_modules", ".bin", "next");

function pgRunning() {
  // pg_ctl status exit code: 0 = running, 3 = stopped, 4 = no/invalid datadir.
  return spawnSync("pg_ctl", ["-D", PGDATA, "status"], { encoding: "utf8" }).status === 0;
}

function ensurePostgres() {
  if (!existsSync(path.join(PGDATA, "PG_VERSION"))) {
    console.warn(`[dev] no Postgres cluster at ${PGDATA} — history charts will be empty.`);
    return;
  }
  if (pgRunning()) {
    console.log("[dev] Postgres already running");
    return;
  }
  console.log("[dev] starting Postgres (.pgdata) …");
  const r = spawnSync(
    "pg_ctl",
    ["-D", PGDATA, "-l", path.join(PGDATA, "server.log"), "start"],
    { stdio: "inherit" },
  );
  if (r.status !== 0) {
    console.error("[dev] could not start Postgres — history charts will be empty.");
  }
}

// Resolve once the dev server is accepting TCP connections.
function waitForPort(port, cb) {
  const tryOnce = () => {
    const sock = createConnection({ host: "127.0.0.1", port: Number(port) }, () => {
      sock.end();
      cb();
    });
    sock.on("error", () => {
      sock.destroy();
      setTimeout(tryOnce, 500);
    });
  };
  tryOnce();
}

ensurePostgres();

if (!process.env.DATABASE_URL) {
  console.warn(
    "[dev] DATABASE_URL not in this shell — make sure it is set in .env.local " +
      "(e.g. postgres://postgres@localhost:5432/ewa) or charts will be empty.",
  );
}

const children = [];
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill("SIGINT");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const next = spawn(nextBin, ["dev", "-p", PORT], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
children.push(next);
next.on("exit", shutdown);

waitForPort(PORT, () => {
  console.log(`[dev] server up on :${PORT} — starting snapshot writer`);
  const writer = spawn("node", [path.join("scripts", "snapshot-writer.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, SNAPSHOT_BASE_URL: `http://localhost:${PORT}` },
  });
  children.push(writer);
});
