import { stringToHex, type Address } from "viem";
import { arbitrumClient } from "../chain/arbitrum";

// Ostium instantaneous funding rate — read from the PairInfos contract on
// Arbitrum, NOT the subgraph. Investigated & verified 2026-06-14:
//
//  - The subgraph's lastFundingRate/curFundingLong/curFundingShort read 0 on
//    every pair. That is NOT a derivation bug: Ostium currently has
//    maxFundingFeePerBlock = 0 on every pair, which zeroes the funding rate
//    (targetRate = maxFundingFeePerBlock × hill(skew)). Confirmed identically
//    across the Ormi subgraph, the PairInfos contract, AND the app's own
//    app.ostium.com/api/pairs (the data the trade UI renders). Funding is
//    genuinely 0 protocol-wide at this time; the hill shape is configured but
//    the magnitude cap is switched off.
//
//  - We still read the canonical on-chain view so that the instant Ostium sets
//    maxFundingFeePerBlock > 0, we surface the real, UI-matching rate with no
//    code change. getPendingAccFundingFees(pairIndex) runs the full spring/hill
//    math on-chain at the current block and returns the live latestFundingRate.
//
// PairInfos is resolved at runtime via TradingStorage.registry() ->
// getContractAddress('pairInfos') so it survives an address change. Resolved
// value on 2026-06-14: 0x3890243A8fc091C626ED26c087A028B46Bc9d66C.

const TRADING_STORAGE: Address = "0xcCd5891083A8acD2074690F65d3024E7D13d66E7";

// latestFundingRate is per-block (PRECISION_18). Ostium's own SDK annualizes
// with (10/3) blocks/sec (≈0.3s Arbitrum blocks). Hourly fraction (matching how
// Hyperliquid/dYdX funding is stored in PerpMarket.funding):
//   hourlyFraction = latestFundingRate/1e18 × (10/3) × 3600
// Sign: positive => longs pay shorts (standard perp convention).
const BLOCKS_PER_SEC = 10 / 3;
const SECONDS_PER_HOUR = 3600;

const storageAbi = [
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const registryAbi = [
  {
    type: "function",
    name: "getContractAddress",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
] as const;

const pairInfosAbi = [
  {
    type: "function",
    name: "getPendingAccFundingFees",
    stateMutability: "view",
    inputs: [{ type: "uint16" }],
    outputs: [
      { name: "accFundingLong", type: "int256" },
      { name: "accFundingShort", type: "int256" },
      { name: "latestFundingRate", type: "int64" },
      { name: "targetFundingRate", type: "int256" },
    ],
  },
] as const;

let pairInfosAddr: Address | null = null;

async function resolvePairInfos(): Promise<Address> {
  if (pairInfosAddr) return pairInfosAddr;
  const registry = await arbitrumClient.readContract({
    address: TRADING_STORAGE,
    abi: storageAbi,
    functionName: "registry",
  });
  const addr = await arbitrumClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "getContractAddress",
    args: [stringToHex("pairInfos", { size: 32 })],
  });
  pairInfosAddr = addr;
  return addr;
}

/**
 * Current hourly funding fraction per Ostium pair id. Best-effort: on any RPC
 * failure returns an empty map and the caller leaves funding = null (the
 * subgraph-derived OI/skew still render). A present value of 0 is the real,
 * verified rate (see header) — distinct from absent (null).
 */
export async function getOstiumFundingRates(
  pairIds: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (pairIds.length === 0) return out;

  const pairInfos = await resolvePairInfos();
  const results = await arbitrumClient.multicall({
    contracts: pairIds.map((id) => ({
      address: pairInfos,
      abi: pairInfosAbi,
      functionName: "getPendingAccFundingFees" as const,
      args: [id] as const,
    })),
    allowFailure: true,
  });

  results.forEach((r, i) => {
    if (r.status !== "success") return;
    const latestFundingRate = r.result[2]; // int64, per-block, PRECISION_18
    const hourly =
      (Number(latestFundingRate) / 1e18) * BLOCKS_PER_SEC * SECONDS_PER_HOUR;
    if (Number.isFinite(hourly)) out.set(pairIds[i]!, hourly);
  });

  return out;
}
