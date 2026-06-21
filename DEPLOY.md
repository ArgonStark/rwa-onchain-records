# Vercel Deployment

## Environment variables

Set these in the Vercel dashboard under **Settings → Environment Variables**:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (`postgres://user:pass@host:5432/db`) |
| `SNAPSHOT_TOKEN` | Recommended | Protects `POST /api/snapshot` and `POST /api/seed` from anonymous callers |
| `ARBITRUM_RPC_URL` | Optional | Arbitrum RPC endpoint (Alchemy/Infura). Defaults to public arb1. Needed for Ostium funding rates |
| `SOLANA_RPC_URL` | Optional | Solana RPC endpoint (Helius/QuickNode). Defaults to `api.mainnet-beta.solana.com` |
| `ETHEREUM_RPC_URL` | Optional | Ethereum RPC — not currently used in production path |

> `CRON_SECRET` is auto-injected by Vercel for cron jobs — do **not** set it manually.

## Cron schedule

`vercel.json` schedules `GET /api/snapshot` every 15 minutes (`*/15 * * * *`).

**Hobby plan limitation**: Vercel Hobby only supports daily crons. You need the **Pro plan** for sub-daily schedules. On Hobby, either upgrade or trigger snapshots manually.

## First-deploy checklist

1. Set env vars above in Vercel dashboard
2. Push to `main` and let Vercel build
3. After deploy, run the seed once to populate historical daily volume:
   ```
   curl -X POST https://<your-domain>/api/seed \
     -H "Authorization: Bearer <SNAPSHOT_TOKEN>"
   ```
   Response includes `ostiumOiFixed` (corrects historical double-counted OI) — idempotent, safe to re-run.
4. Verify the first snapshot: `GET https://<your-domain>/api/snapshot` (with the `Authorization` header if `SNAPSHOT_TOKEN` is set)
5. Check `GET /api/issuance` — supply data will appear; 7-day deltas accumulate after ~7 days of cron runs

## Data accumulation timeline

| Feature | When it appears |
|---|---|
| Current supply | Immediately after first snapshot |
| 7-day issuance delta | After 7 days of snapshots (~7 days × 96 ticks/day) |
| 30-day issuance delta | After 30 days of snapshots |
| Daily volume chart bars | Populated by seed; ongoing via snapshot rollup |

## Database schema

Schema is created automatically on first snapshot (`ensureSchema()` in `lib/db.ts`). No manual migration needed. Tables:

- `perp_snapshots` — per-market OI, funding, volume, mark price (every 15 min)
- `token_snapshots` — per-token price, premium, circulating supply (every 15 min)
- `daily_volume` — UTC-day notional volume per venue/symbol (seeded + rolling rollup)
