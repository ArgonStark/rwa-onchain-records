import type { SpotToken } from "../lib/types";

// Spot tokenized assets we track in Phase 1. Contracts/mints from
// docs/DATA_SOURCES.md — xStocks SPL mints should be re-verified on Solscan
// (scam clones exist) before adding more.

export const SPOT_TOKENS: SpotToken[] = [
  // ── Tokenized gold (Ethereum ERC-20) ───────────────────────────────
  {
    symbol: "PAXG",
    name: "Pax Gold",
    category: "commodity",
    chain: "Ethereum",
    address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
    coingeckoId: "pax-gold",
    underlying: "XAU",
    tradeVenue: "Binance",
    tradeUrl: "https://www.binance.com/en/trade/PAXG_USDT",
  },
  {
    symbol: "XAUT",
    name: "Tether Gold",
    category: "commodity",
    chain: "Ethereum",
    address: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    coingeckoId: "tether-gold",
    underlying: "XAU",
    tradeVenue: "Binance",
    tradeUrl: "https://www.binance.com/en/trade/XAUT_USDT",
  },

  // ── Tokenized equities — xStocks (Backed; Solana SPL Token-2022) ─────
  // Jupiter price v3 returns both the token price and the underlying stock
  // price, so premium is computed from real data (no equities-API key needed).
  {
    symbol: "TSLAx",
    name: "Tesla xStock",
    category: "equity",
    chain: "Solana",
    address: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    underlying: "TSLA",
    tradeVenue: "Jupiter",
    tradeUrl: "https://jup.ag/swap/USDC-XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  },
  {
    symbol: "NVDAx",
    name: "NVIDIA xStock",
    category: "equity",
    chain: "Solana",
    address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    underlying: "NVDA",
    tradeVenue: "Jupiter",
    tradeUrl: "https://jup.ag/swap/USDC-Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  },
  {
    symbol: "AAPLx",
    name: "Apple xStock",
    category: "equity",
    chain: "Solana",
    address: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    underlying: "AAPL",
    tradeVenue: "Jupiter",
    tradeUrl: "https://jup.ag/swap/USDC-XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  },
  {
    symbol: "SPYx",
    name: "S&P 500 xStock",
    category: "equity",
    chain: "Solana",
    address: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    underlying: "SPY",
    tradeVenue: "Jupiter",
    tradeUrl: "https://jup.ag/swap/USDC-XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  },
  {
    symbol: "CRCLx",
    name: "Circle xStock",
    category: "equity",
    chain: "Solana",
    address: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
    underlying: "CRCL",
    tradeVenue: "Jupiter",
    tradeUrl: "https://jup.ag/swap/USDC-XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
  },
];
