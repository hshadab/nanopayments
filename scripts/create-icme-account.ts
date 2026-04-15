#!/usr/bin/env tsx
// Create an ICME Preflight account by paying 5 USDC on Base mainnet via x402.
import "dotenv/config";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getUsdcBalance, signAndBuildPaymentHeader, type X402Requirements } from "./x402-base-pay.js";

const ICME_CREATE_URL = "https://api.icme.io/v1/createUserX402";
const USERNAME = process.argv[2] || "icme-circle-nanopay-demo";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey || privateKey === "0x_your_evm_private_key") {
    console.error("Set PRIVATE_KEY in .env first");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Wallet: ${account.address}`);
  console.log(`Username: ${USERNAME}`);
  console.log();

  const balance = await getUsdcBalance(account.address);
  console.log(`USDC balance on Base: ${balance / 1e6} USDC`);

  if (balance < 5_000_000) {
    console.error(`Need at least 5 USDC. Current balance: ${balance / 1e6}`);
    console.error(`Send USDC on Base mainnet to: ${account.address}`);
    process.exit(1);
  }

  console.log("\nStep 1: Getting payment requirements...");
  const initRes = await fetch(ICME_CREATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME }),
  });

  const requirements = await initRes.json() as X402Requirements;

  if (!requirements.accepts || requirements.accepts.length === 0) {
    console.error("Unexpected response:", JSON.stringify(requirements, null, 2));
    process.exit(1);
  }

  const payReq = requirements.accepts[0];
  console.log(`  Pay to: ${payReq.payTo}`);
  console.log(`  Amount: ${Number(payReq.amount) / 1e6} USDC`);
  console.log(`  Network: ${payReq.network}`);
  console.log(`  Method: ${payReq.extra.assetTransferMethod}`);

  console.log("\nStep 2: Signing EIP-3009 authorization...");
  const paymentHeader = await signAndBuildPaymentHeader(privateKey, requirements);

  console.log("\nStep 3: Sending payment...");
  const createRes = await fetch(ICME_CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Payment-Signature": paymentHeader,
    },
    body: JSON.stringify({ username: USERNAME }),
  });

  const result = await createRes.json();

  if (createRes.ok) {
    console.log("\n=== ACCOUNT CREATED ===");
    console.log(JSON.stringify(result, null, 2));
    console.log("\nSave these to .env:");
    console.log(`ICME_API_KEY=${(result as { api_key: string }).api_key}`);
    console.log(`\nCredits: ${(result as { credits: number }).credits}`);
  } else {
    console.error(`\nFailed (${createRes.status}):`);
    console.error(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
