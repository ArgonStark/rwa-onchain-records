import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

// Server-side Ethereum mainnet client for on-chain reads (ERC-20 mint/burn
// issuance for PAXG, XAUT). Never imported into client code.
// Public RPC handles low-frequency issuance snapshots; provide ETHEREUM_RPC_URL
// (Alchemy/Infura) for production to avoid rate limits on paginated log scans.
export const ETHEREUM_RPC_URL =
  process.env.ETHEREUM_RPC_URL || "https://ethereum.publicnode.com";

export const ethereumClient = createPublicClient({
  chain: mainnet,
  transport: http(ETHEREUM_RPC_URL, { timeout: 30_000 }),
});
