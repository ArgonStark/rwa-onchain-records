// One-off investigation: resolve Ostium PairInfos via the registry and read the
// on-chain funding view getPendingAccFundingFees() for a few skewed pairs.
// Run: node scripts/investigate-funding.mjs
import { createPublicClient, http, stringToHex } from "viem";
import { arbitrum } from "viem/chains";

const RPC = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
const TRADING_STORAGE = "0xcCd5891083A8acD2074690F65d3024E7D13d66E7";

const client = createPublicClient({ chain: arbitrum, transport: http(RPC) });

const storageAbi = [
  { type: "function", name: "registry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const registryAbi = [
  { type: "function", name: "getContractAddress", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] },
];
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
  { type: "function", name: "maxFundingFeePerBlock", stateMutability: "view", inputs: [{ type: "uint16" }], outputs: [{ type: "uint256" }] },
];

const PAIRS = [
  { id: 0, sym: "BTC", skew: 84.8 },
  { id: 1, sym: "ETH", skew: 86.8 },
  { id: 9, sym: "SOL", skew: 61.5 },
  { id: 18, sym: "NVDA", skew: 99.9 },
  { id: 22, sym: "TSLA", skew: 98.1 },
  { id: 67, sym: "MU", skew: 100.0 },
];

// SDK annualization: pct over period_hours = fr_perBlock * (10/3) * 3600 * 100 * hours
// (10/3) = Arbitrum blocks/sec (~0.3s). fr is per-block, int64 scaled 1e18.
function annualizePct(frInt64, hours) {
  return (Number(frInt64) / 1e18) * (10 / 3) * 3600 * 100 * hours;
}

async function main() {
  const block = await client.getBlockNumber();
  const registry = await client.readContract({ address: TRADING_STORAGE, abi: storageAbi, functionName: "registry" });
  console.log("block:", block, "registry:", registry);

  const pairInfos = await client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "getContractAddress",
    args: [stringToHex("pairInfos", { size: 32 })],
  });
  console.log("pairInfos:", pairInfos);
  console.log("");

  for (const p of PAIRS) {
    try {
      const [accL, accS, fr, target] = await client.readContract({
        address: pairInfos, abi: pairInfosAbi, functionName: "getPendingAccFundingFees", args: [p.id],
      });
      console.log(
        `${p.sym.padEnd(5)} skew=${String(p.skew).padStart(5)}%  ` +
        `fr/blk=${(Number(fr) / 1e18).toExponential(4)}  ` +
        `annual=${annualizePct(fr, 24 * 365).toFixed(2)}%  ` +
        `1h=${annualizePct(fr, 1).toFixed(6)}%  ` +
        `target(annual)=${annualizePct(target, 24 * 365).toFixed(2)}%  ` +
        `accL=${(Number(accL) / 1e18).toFixed(4)} accS=${(Number(accS) / 1e18).toFixed(4)}`
      );
    } catch (e) {
      console.log(`${p.sym}: ERROR ${e.shortMessage || e.message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
