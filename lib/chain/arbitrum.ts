import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";

// Server-side Arbitrum One client for on-chain reads (Ostium funding, future
// issuance indexing). RPC URL is server-only — never imported into client code.
// Public RPC is fine for low-frequency snapshot reads; override for production.
export const ARBITRUM_RPC_URL =
  process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";

export const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_RPC_URL),
});
