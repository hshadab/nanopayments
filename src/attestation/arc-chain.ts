import { defineChain } from "viem";

/**
 * Circle Arc Testnet — stablecoin-native settlement layer for USDC.
 *
 * CAIP-2 id: `eip155:5042002`. Used by the Circle Gateway SDK for Nanopayment
 * settlement and (in this demo) for on-chain proof attestations.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: process.env.ARC_EXPLORER_URL || "https://explorer.testnet.arc.network",
    },
  },
  testnet: true,
});
