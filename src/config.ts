import "dotenv/config";

export const config = {
  // Circle Gateway / Arc Testnet
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  sellerAddress: process.env.SELLER_ADDRESS as `0x${string}`,
  sellerPort: parseInt(process.env.SELLER_PORT || "3100"),
  chain: "arcTestnet" as const,

  // ICME Preflight
  icmeApiKey: process.env.ICME_API_KEY!,
  icmePolicyId: process.env.ICME_POLICY_ID!,
  icmeBaseUrl: "https://api.icme.io/v1",

  // OpenAI (only needed for legacy LangChain demo)
  openaiApiKey: process.env.OPENAI_API_KEY!,

  // Demo
  sellerBaseUrl: `http://localhost:${process.env.SELLER_PORT || "3100"}`,

  // Verified mode
  sellerRequireProof: process.env.SELLER_REQUIRE_PROOF !== "false",
  demoMode: (process.env.DEMO_MODE || "verified") as "legacy" | "verified",
} as const;
