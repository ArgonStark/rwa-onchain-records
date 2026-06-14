// Snapshot writer — POSTs /api/snapshot every ~5 min so we accumulate our own
// time-series. Run alongside the app:  node scripts/snapshot-writer.mjs
// Env: SNAPSHOT_BASE_URL (default http://localhost:3737), SNAPSHOT_TOKEN (optional).
const BASE = process.env.SNAPSHOT_BASE_URL || "http://localhost:3737";
const TOKEN = process.env.SNAPSHOT_TOKEN;
const INTERVAL_MS = 5 * 60 * 1000;

async function tick() {
  const stamp = new Date().toISOString();
  try {
    const res = await fetch(`${BASE}/api/snapshot`, {
      method: "POST",
      headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    console.log(stamp, res.status, JSON.stringify(body));
  } catch (e) {
    console.error(stamp, "snapshot failed:", e.message);
  }
}

console.log(`snapshot-writer → ${BASE}/api/snapshot every ${INTERVAL_MS / 1000}s`);
tick();
setInterval(tick, INTERVAL_MS);
